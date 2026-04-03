"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useAppDispatch, useAppState } from "../store/appStore";
import type { DiffBuckets, DiffRow } from "../lib/types";
import { exportCSV } from "../lib/csv";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

const tabs: Array<{ id: keyof DiffBuckets; label: string; icon: string; color: string }> = [
  { id: "missing", label: "New Groups", icon: "+", color: "#a78bfa" },
  { id: "needsUpdate", label: "Needs Update", icon: "↺", color: "#f59e0b" },
  { id: "matches", label: "Matches", icon: "✓", color: "#10b981" },
  { id: "staticInPortal", label: "Static", icon: "■", color: "#6b7280" }
];

// Column configuration for resizable columns
interface ColumnConfig {
  id: string;
  label: string;
  minWidth: number;
  defaultWidth: number;
}

const COLUMNS: ColumnConfig[] = [
  { id: "select", label: "", minWidth: 40, defaultWidth: 50 },
  { id: "fullPath", label: "Full Path", minWidth: 150, defaultWidth: 300 },
  { id: "current", label: "Current appliesTo", minWidth: 150, defaultWidth: 350 },
  { id: "new", label: "New appliesTo", minWidth: 150, defaultWidth: 350 },
  { id: "hosts", label: "Hosts", minWidth: 60, defaultWidth: 70 },
];

export function DiffTables() {
  const {
    diffs,
    creds,
    groups,
    schema,
    parentGroup,
    generated,
    focusCustomers,
    excludeCustomers,
  } = useAppState();
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<keyof DiffBuckets>("missing");
  const [status, setStatus] = useState<string>("");
  const [endpointsHit, setEndpointsHit] = useState<string[]>([]);
  const [responses, setResponses] = useState<string[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState<"apply" | "dryrun" | null>(null);
  const [summaryFilter, setSummaryFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<{
    rowKey: string;
    text: string;
    source: "current" | "new";
  } | null>(null);
  const newAppliesRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    Object.fromEntries(COLUMNS.map(col => [col.id, col.defaultWidth]))
  );

  // Resizing state
  const resizingRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    resizingRef.current = {
      columnId,
      startX: e.clientX,
      startWidth: columnWidths[columnId]
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(
        COLUMNS.find(c => c.id === resizingRef.current!.columnId)?.minWidth || 50,
        resizingRef.current.startWidth + diff
      );
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.columnId]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [columnWidths]);

  useEffect(() => {
    setSelectedMatch(null);
  }, [activeTab]);

  const rows = useMemo(() => (diffs ? diffs[activeTab] : []), [diffs, activeTab]);

  const customerKey = schema.layers[0]?.parts[0]?.key;
  const matchesCustomerFilter = useCallback((fullPath: string) => {
    const prefix = parentGroup.replace(/\/$/, "") + "/";
    if (!fullPath.startsWith(prefix)) {
      return false;
    }
    const remainder = fullPath.slice(prefix.length);
    const value = remainder.split("/", 1)[0] || "";
    const lowerValue = value.toLowerCase();
    if (excludeCustomers.length > 0) {
      if (excludeCustomers.map((v) => v.toLowerCase()).includes(lowerValue)) {
        return false;
      }
    }
    if (focusCustomers.length > 0) {
      return focusCustomers.map((v) => v.toLowerCase()).includes(lowerValue);
    }
    return true;
  }, [parentGroup, focusCustomers, excludeCustomers]);

  const rowsByCustomer = useMemo(
    () => rows.filter((row) => matchesCustomerFilter(row.fullPath)),
    [rows, matchesCustomerFilter]
  );
  const normalizedTableFilter = tableFilter.trim().toLowerCase();
  const tableFilterActive = normalizedTableFilter.length > 0;
  const filteredRows = useMemo(() => {
    if (!tableFilterActive) return rowsByCustomer;
    return rowsByCustomer.filter((row) => {
      const haystack = [
        row.fullPath,
        row.current_applies_to || "",
        row.new_applies_to || ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedTableFilter);
    });
  }, [rowsByCustomer, tableFilterActive, normalizedTableFilter]);

  // Calculate selected rows by category
  const selectedMissing = useMemo(() => {
    if (!diffs) return [];
    return diffs.missing
      .filter((row) => row.selected)
      .filter((row) => matchesCustomerFilter(row.fullPath));
  }, [diffs, matchesCustomerFilter]);

  const selectedNeedsUpdate = useMemo(() => {
    if (!diffs) return [];
    return diffs.needsUpdate
      .filter((row) => row.selected)
      .filter((row) => matchesCustomerFilter(row.fullPath));
  }, [diffs, matchesCustomerFilter]);

  const totalSelected = selectedMissing.length + selectedNeedsUpdate.length;
  const normalizedSummaryFilter = summaryFilter.trim().toLowerCase();
  const summaryFilterActive = normalizedSummaryFilter.length > 0;
  const matchesSummaryFilter = (row: DiffRow) => {
    if (!summaryFilterActive) return true;
    const haystack = [
      row.fullPath,
      row.current_applies_to || "",
      row.new_applies_to || ""
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSummaryFilter);
  };
  const filteredMissing = useMemo(
    () => selectedMissing.filter(matchesSummaryFilter),
    [selectedMissing, normalizedSummaryFilter]
  );
  const filteredNeedsUpdate = useMemo(
    () => selectedNeedsUpdate.filter(matchesSummaryFilter),
    [selectedNeedsUpdate, normalizedSummaryFilter]
  );
  const filteredTotal = filteredMissing.length + filteredNeedsUpdate.length;

  const hasPortalConnection = groups.length > 0 || creds.portal !== "";
  const getFirstSegment = useCallback((path: string) => {
    const prefix = parentGroup.replace(/\/$/, "") + "/";
    const remainder = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    return remainder.split("/", 1)[0] || "";
  }, [parentGroup]);

  const customerNames = useMemo(() => {
    const set = new Set<string>();
    const add = (path: string) => {
      const seg = getFirstSegment(path);
      if (seg) set.add(seg);
    };
    generated.forEach((g) => add(g.fullPath));
    groups.forEach((g) => add(g.fullPath));
    return Array.from(set);
  }, [generated, groups, getFirstSegment]);

  const extractCustomerRegexes = useCallback((appliesTo: string) => {
    if (!customerKey) return [];
    const escaped = customerKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}\\s*=~\\s*\"([^\"]*)\"`, "g");
    const results: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(appliesTo)) !== null) {
      if (match[1]) results.push(match[1]);
    }
    return results;
  }, [customerKey]);

  const collisionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!diffs || !customerKey) return map;
    const rowsToCheck = [...diffs.missing, ...diffs.needsUpdate]
      .filter((row) => matchesCustomerFilter(row.fullPath));
    rowsToCheck.forEach((row) => {
      const intended = getFirstSegment(row.fullPath);
      if (!intended) return;
      const patterns = extractCustomerRegexes(row.new_applies_to || "");
      if (patterns.length === 0) return;
      const matches = new Set<string>();
      patterns.forEach((pattern) => {
        let re: RegExp | null = null;
        try {
          re = new RegExp(pattern, "i");
        } catch {
          re = null;
        }
        if (!re) return;
        customerNames.forEach((name) => {
          if (re!.test(name) && name.toLowerCase() !== intended.toLowerCase()) {
            matches.add(name);
          }
        });
      });
      if (matches.size > 0) {
        map.set(row.fullPath, Array.from(matches).sort());
      }
    });
    return map;
  }, [diffs, customerKey, customerNames, extractCustomerRegexes, getFirstSegment, matchesCustomerFilter]);

  const collisionRows = useMemo(() => {
    if (!diffs) return [];
    const rowsToCheck = [...diffs.missing, ...diffs.needsUpdate]
      .filter((row) => matchesCustomerFilter(row.fullPath));
    return rowsToCheck.filter((row) => (collisionMap.get(row.fullPath) || []).length > 0);
  }, [diffs, collisionMap, matchesCustomerFilter]);

  const collisionCustomers = useMemo(() => {
    if (!diffs) return [];
    const set = new Set<string>();
    const rowsToCheck = [...diffs.missing, ...diffs.needsUpdate]
      .filter((row) => matchesCustomerFilter(row.fullPath));
    rowsToCheck.forEach((row) => {
      if (collisionMap.get(row.fullPath)?.length) {
        const intended = getFirstSegment(row.fullPath);
        if (intended) set.add(intended);
      }
    });
    return Array.from(set).sort();
  }, [diffs, collisionMap, getFirstSegment, matchesCustomerFilter]);

  const highlightText = (text: string, match: string) => {
    if (!match) return text;
    if (!text.includes(match)) return text;
    const parts = text.split(match);
    return (
      <>
        {parts.map((part, idx) => (
          <span key={`${idx}-${part.length}`}>
            {part}
            {idx < parts.length - 1 && <mark className="diff-highlight">{match}</mark>}
          </span>
        ))}
      </>
    );
  };

  const handleCurrentSelect = (row: DiffRow, el: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    if (!selection.anchorNode || !selection.focusNode) return;
    if (!el.contains(selection.anchorNode) || !el.contains(selection.focusNode)) return;
    const text = selection.toString();
    if (!text) {
      setSelectedMatch(null);
      return;
    }
    setSelectedMatch({ rowKey: row.fullPath, text, source: "current" });
    const textarea = newAppliesRefs.current.get(row.fullPath);
    if (textarea && row.new_applies_to.includes(text)) {
      const start = row.new_applies_to.indexOf(text);
      textarea.focus();
      textarea.setSelectionRange(start, start + text.length);
    }
  };

  const handleNewSelect = (row: DiffRow, el: HTMLTextAreaElement) => {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) {
      setSelectedMatch(null);
      return;
    }
    const text = el.value.slice(start, end);
    if (!text) {
      setSelectedMatch(null);
      return;
    }
    setSelectedMatch({ rowKey: row.fullPath, text, source: "new" });
  };

  const handleApply = async (isDryRun: boolean) => {
    if (!diffs) {
      return;
    }
    setShowConfirmation(false);
    setPendingAction(null);
    setStatus(isDryRun ? "Running dry run..." : "Applying changes...");
    setEndpointsHit([]);
    setResponses([]);
    setLogLines([]);
    try {
      const endpoints: string[] = [];
      const collectedResponses: string[] = [];
      const collectedLogs: string[] = [];

      // Create new groups
      if (selectedMissing.length > 0) {
        const response = await postJSON<{
          endpoints?: string[];
          results?: Array<{ response?: unknown; statusCode?: number | string }>;
          logs?: string[];
        }>(
          "/api/lm/create-groups",
          { creds, dryRun: isDryRun, rows: selectedMissing }
        );
        endpoints.push(...(response.endpoints || ["/device/groups"]));
        response.results?.forEach((result) => {
          if (result.statusCode !== undefined) {
            collectedResponses.push(`status ${result.statusCode}`);
          }
        });
        collectedLogs.push(...(response.logs || []));
      }

      // Update existing groups
      if (selectedNeedsUpdate.length > 0) {
        const response = await postJSON<{
          endpoints?: string[];
          results?: Array<{ response?: unknown; statusCode?: number | string }>;
          logs?: string[];
        }>(
          "/api/lm/update-appliesto",
          { creds, dryRun: isDryRun, rows: selectedNeedsUpdate }
        );
        endpoints.push(...(response.endpoints || []));
        response.results?.forEach((result) => {
          if (result.statusCode !== undefined) {
            collectedResponses.push(`status ${result.statusCode}`);
          }
        });
        collectedLogs.push(...(response.logs || []));
      }

      setEndpointsHit(endpoints);
      setResponses(collectedResponses);
      setLogLines(collectedLogs);
      setStatus(isDryRun ? "Dry run complete. No changes were made." : "Changes applied successfully.");
    } catch (err) {
      setStatus(`${isDryRun ? "Dry run" : "Apply"} failed: ${(err as Error).message}`);
    }
  };

  const handleActionClick = (action: "apply" | "dryrun") => {
    setPendingAction(action);
    setShowConfirmation(true);
  };

  const confirmAction = () => {
    if (pendingAction === "apply") {
      handleApply(false);
    } else if (pendingAction === "dryrun") {
      handleApply(true);
    }
  };

  const toggleRow = (row: DiffRow, checked: boolean) => {
    dispatch({ type: "UPDATE_ROW", payload: { bucket: activeTab, row: { ...row, selected: checked } } });
  };

  const selectAllInTab = () => {
    if (!diffs) return;
    const targetRows = tableFilterActive ? filteredRows : rowsByCustomer;
    targetRows.forEach((row) => {
      if (!row.selected) {
        dispatch({
          type: "UPDATE_ROW",
          payload: { bucket: activeTab, row: { ...row, selected: true } }
        });
      }
    });
  };

  const deselectAllInTab = () => {
    if (!diffs) return;
    const targetRows = tableFilterActive ? filteredRows : rowsByCustomer;
    targetRows.forEach((row) => {
      if (row.selected) {
        dispatch({
          type: "UPDATE_ROW",
          payload: { bucket: activeTab, row: { ...row, selected: false } }
        });
      }
    });
  };

  if (!diffs) {
    return (
      <div className="diff-empty-state">
        <div className="empty-icon">📊</div>
        <h3>No Update Data</h3>
        <p>Generate a tree in the Preview tab to see what needs updating</p>
      </div>
    );
  }

  return (
    <div className="diff-tables-full">
      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-modal">
            <div className="confirmation-header">
              <h3>{pendingAction === "dryrun" ? "Confirm Dry Run" : "Confirm Apply Changes"}</h3>
              <button
                className="close-btn"
                onClick={() => setShowConfirmation(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="confirmation-body">
              {pendingAction === "dryrun" ? (
                <p className="confirmation-description">
                  This will simulate the changes without modifying anything in the portal.
                  Use this to verify what would happen before applying.
                </p>
              ) : (
                <p className="confirmation-description warning">
                  This will make real changes to your LogicMonitor portal.
                  Please review the selected items carefully.
                </p>
              )}

              <div className="confirmation-summary">
                <h4>Selected Changes Summary</h4>
                <div className="summary-filter">
                  <input
                    type="text"
                    value={summaryFilter}
                    onChange={(e) => setSummaryFilter(e.target.value)}
                    placeholder="Filter selected changes by path or appliesTo..."
                    aria-label="Filter selected changes summary"
                  />
                  {summaryFilterActive && (
                    <span className="summary-filter-count">
                      Showing {filteredTotal} of {totalSelected}
                    </span>
                  )}
                </div>

                {filteredMissing.length > 0 && (
                  <div className="summary-section">
                    <div className="summary-header create">
                      <span className="summary-icon">+</span>
                      <span>Create {selectedMissing.length} new group{selectedMissing.length !== 1 ? "s" : ""}</span>
                    </div>
                    <ul className="summary-list">
                      {filteredMissing.slice(0, 5).map((row) => (
                        <li key={row.fullPath}>
                          <code>{row.fullPath}</code>
                        </li>
                      ))}
                      {filteredMissing.length > 5 && (
                        <li className="more-items">...and {filteredMissing.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {filteredNeedsUpdate.length > 0 && (
                  <div className="summary-section">
                    <div className="summary-header update">
                      <span className="summary-icon">↺</span>
                      <span>Update {selectedNeedsUpdate.length} existing group{selectedNeedsUpdate.length !== 1 ? "s" : ""}</span>
                    </div>
                    <ul className="summary-list">
                      {filteredNeedsUpdate.slice(0, 5).map((row) => (
                        <li key={row.fullPath}>
                          <code>{row.fullPath}</code>
                          <div className="change-preview">
                            <span className="old">{row.current_applies_to || "(empty)"}</span>
                            <span className="arrow">→</span>
                            <span className="new">{row.new_applies_to}</span>
                          </div>
                        </li>
                      ))}
                      {filteredNeedsUpdate.length > 5 && (
                        <li className="more-items">...and {filteredNeedsUpdate.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {summaryFilterActive && totalSelected > 0 && filteredTotal === 0 && (
                  <div className="no-selection-warning">
                    No selected groups match that filter.
                  </div>
                )}

                {totalSelected === 0 && (
                  <div className="no-selection-warning">
                    No groups selected. Select groups from the "Missing" or "Needs Update" tabs.
                  </div>
                )}
              </div>

              <div className="portal-info">
                <span className="portal-label">Target Portal:</span>
                <code>{creds.portal || "Not connected"}</code>
              </div>
            </div>

            <div className="confirmation-footer">
              <button
                className="button secondary"
                onClick={() => setShowConfirmation(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`button ${pendingAction === "dryrun" ? "warning" : "danger"}`}
                onClick={confirmAction}
                disabled={totalSelected === 0}
                type="button"
              >
                {pendingAction === "dryrun" ? "Run Dry Run" : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="diff-tabs-bar">
        {tabs.map((tab) => {
          const bucket = diffs ? diffs[tab.id] : [];
          const filteredBucket = bucket.filter((row) => matchesCustomerFilter(row.fullPath));
          const count = filteredBucket.length;
          const selectedCount = filteredBucket.filter(r => r.selected).length;
          return (
            <button
              key={tab.id}
              className={`diff-tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span
                className="tab-icon"
                style={{
                  background: activeTab === tab.id ? "rgba(255,255,255,0.2)" : `${tab.color}15`,
                  color: activeTab === tab.id ? "white" : tab.color
                }}
              >
                {tab.icon}
              </span>
              <span className="tab-label">{tab.label}</span>
              {count > 0 && (
                <span className="tab-count">
                  {selectedCount > 0 ? `${selectedCount}/` : ""}{count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="diff-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={selectAllInTab} type="button">
            Select All ({filteredRows.length})
          </button>
          <button className="toolbar-btn" onClick={deselectAllInTab} type="button">
            Deselect All
          </button>
          <span className="toolbar-divider" />
          <input
            className="toolbar-search"
            type="text"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            placeholder="Search updates..."
            aria-label="Search updates"
          />
          <button
            className="toolbar-btn"
            onClick={() => {
              if (!diffs) return;
              const filterBucket = (rows: DiffRow[]) =>
                rows.filter((row) => matchesCustomerFilter(row.fullPath));
              const allRows = [
                ...filterBucket(diffs.missing).map((row) => ({ ...row, action: "create" as const })),
                ...filterBucket(diffs.needsUpdate).map((row) => ({ ...row, action: "update" as const })),
                ...filterBucket(diffs.matches).map((row) => ({ ...row, action: "match" as const })),
                ...filterBucket(diffs.staticInPortal).map((row) => ({ ...row, action: "static" as const }))
              ];
              const csv = exportCSV(allRows);
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "lm-group-updates.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            type="button"
          >
            Export CSV
          </button>
        </div>

        <div className="toolbar-right">
          <span className="selection-summary">
            {selectedMissing.length > 0 && (
              <span className="selection-badge create">
                +{selectedMissing.length} to create
              </span>
            )}
            {selectedNeedsUpdate.length > 0 && (
              <span className="selection-badge update">
                ↺{selectedNeedsUpdate.length} to update
              </span>
            )}
          </span>
        </div>
      </div>

      {collisionRows.length > 0 && (
        <details className="notice" style={{ margin: "12px 16px 0" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Potential customer regex collisions ({collisionRows.length})
          </summary>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-tertiary)" }}>
            We check `{customerKey}` regexes in the new appliesTo against known customer names.
            These rows may match additional customers.
          </div>
          {collisionCustomers.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <strong>Consider excluding:</strong>{" "}
              <code>{collisionCustomers.join(", ")}</code>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {collisionRows.map((row) => {
              const matches = collisionMap.get(row.fullPath) || [];
              return (
                <div key={`collision-${row.fullPath}`} style={{ marginBottom: 6 }}>
                  <code>{row.fullPath}</code> matches: {matches.join(", ")}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Table */}
      <div className="diff-table-container">
        <table className="diff-table resizable">
          <thead>
            <tr>
              {COLUMNS.map((col, idx) => (
                <th
                  key={col.id}
                  style={{ width: columnWidths[col.id], minWidth: col.minWidth }}
                >
                  <div className="th-content">
                    {col.label}
                    {idx < COLUMNS.length - 1 && (
                      <div
                        className="resize-handle"
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={activeTab}>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-row">
                  {tableFilterActive ? "No items match that search" : "No items in this category"}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.fullPath} className={row.selected ? "selected" : ""}>
                  <td style={{ width: columnWidths.select }}>
                    <input
                      type="checkbox"
                      checked={row.selected ?? false}
                      onChange={(e) => toggleRow(row, e.target.checked)}
                    />
                  </td>
                  <td style={{ width: columnWidths.fullPath }}>
                    <div className="cell-content" title={row.fullPath}>
                      {row.fullPath}
                    </div>
                  </td>
                  <td className="applies-to-cell" style={{ width: columnWidths.current }}>
                    <div
                      className="cell-content mono"
                      title={row.current_applies_to}
                      onMouseUp={(e) => handleCurrentSelect(row, e.currentTarget)}
                    >
                      {row.current_applies_to
                        ? (selectedMatch &&
                          selectedMatch.rowKey === row.fullPath &&
                          row.current_applies_to.includes(selectedMatch.text) &&
                          selectedMatch.source === "new"
                            ? highlightText(row.current_applies_to, selectedMatch.text)
                            : row.current_applies_to)
                        : <span className="empty-value">-</span>}
                    </div>
                  </td>
                  <td className="applies-to-cell" style={{ width: columnWidths.new }}>
                    <textarea
                      className="cell-editor"
                      value={row.new_applies_to}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_ROW",
                          payload: { bucket: activeTab, row: { ...row, new_applies_to: e.target.value } }
                        })
                      }
                      onMouseUp={(e) => handleNewSelect(row, e.currentTarget)}
                      onKeyUp={(e) => handleNewSelect(row, e.currentTarget)}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onFocus={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      ref={(el) => {
                        if (!el) return;
                        newAppliesRefs.current.set(row.fullPath, el);
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      title={row.new_applies_to}
                      rows={1}
                    />
                    {collisionMap.get(row.fullPath)?.length ? (
                      <div className="applies-warning">
                        ⚠ Matches: {collisionMap.get(row.fullPath)?.join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ width: columnWidths.hosts }}>
                    {row.numOfHosts ?? "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Action Bar */}
      <div className="diff-action-bar">
        <div className="action-bar-left">
          <span className="selected-count">
            {totalSelected} item{totalSelected !== 1 ? "s" : ""} selected for update
          </span>
        </div>
        <div className="action-bar-right">
          {!hasPortalConnection && (
            <span className="no-portal-warning">
              No portal connection - changes cannot be applied
            </span>
          )}
          <button
            className="dryrun-button"
            onClick={() => handleActionClick("dryrun")}
            disabled={totalSelected === 0 || !hasPortalConnection}
            type="button"
          >
            <span>Dry Run</span>
            {totalSelected > 0 && (
              <span className="action-count">{totalSelected}</span>
            )}
          </button>
          <button
            className="apply-button"
            onClick={() => handleActionClick("apply")}
            disabled={totalSelected === 0 || !hasPortalConnection}
            type="button"
          >
            <span>Apply Changes</span>
            {totalSelected > 0 && (
              <span className="action-count">{totalSelected}</span>
            )}
          </button>
        </div>
      </div>

      {/* Status and Logs */}
      {(status || logLines.length > 0) && (
        <div className="diff-logs">
          {status && (
            <div className={`log-status ${status.includes("successfully") || status.includes("complete") ? "success" : status.includes("failed") ? "error" : "pending"}`}>
              {status}
            </div>
          )}

          {endpointsHit.length > 0 && (
            <div className="log-section">
              <strong>Endpoints:</strong>
              <code>{endpointsHit.join(", ")}</code>
            </div>
          )}

          {responses.length > 0 && (
            <div className="log-section">
              <strong>Responses:</strong>
              <code>{responses.join(", ")}</code>
            </div>
          )}

          {logLines.length > 0 && (
            <div className="log-section">
              <div className="log-header">
                <strong>Run Log</strong>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(logLines.join("\n"))}
                  type="button"
                >
                  Copy
                </button>
              </div>
              <pre className="log-content">{logLines.join("\n")}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
