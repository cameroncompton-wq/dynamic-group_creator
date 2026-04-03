"use client";

import { useMemo, useState, useRef } from "react";
import { useAppState } from "../store/appStore";

type VariantStats = {
  name: string;
  count: number;
  devices: Array<{ id: number; name: string }>;
};

type PropertyStats = {
  key: string;
  canonical: string;
  total: number;
  variants: VariantStats[];
  outliers: VariantStats[];
};

type Misspelling = {
  name: string;
  count: number;
  suggested: string;
  suggestedCount: number;
  devices: Array<{ id: number; name: string }>;
};

type ValueVariantStats = {
  value: string;
  count: number;
  devices: Array<{ id: number; name: string }>;
};

type ValueCasingIssue = {
  propName: string;
  canonical: string;
  variants: ValueVariantStats[];
  outliers: ValueVariantStats[];
};

type ValueMisspelling = {
  propName: string;
  value: string;
  count: number;
  suggested: string;
  suggestedCount: number;
  devices: Array<{ id: number; name: string }>;
};

const MAX_DEVICE_PREVIEW = 50;

export function ConsolidationTab() {
  const { devices, creds } = useAppState();
  const [outputFilter, setOutputFilter] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [selectedValueProps, setSelectedValueProps] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [completed, setCompleted] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const [activeSection, setActiveSection] = useState<"names" | "values">("names");
  const [activeIssue, setActiveIssue] = useState<"casing" | "misspelling">("casing");
  const [runStatusByKey, setRunStatusByKey] = useState<Record<string, string>>({});
  const [runLogsByKey, setRunLogsByKey] = useState<Record<string, string[]>>({});
  const [runRunningByKey, setRunRunningByKey] = useState<Record<string, boolean>>({});
  const canFix = Boolean(creds.portal && creds.accessId && creds.accessKey);

  const postJSON = async <T,>(url: string, body: unknown): Promise<T> => {
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
  };

  const properties = useMemo(() => {
    const byLower = new Map<string, Map<string, { count: number; devices: Map<number, string> }>>();
    const byName = new Map<string, { count: number; devices: Map<number, string> }>();

    devices.forEach((device) => {
      (device.customProperties || []).forEach((prop) => {
        if (!prop?.name) return;
        const lower = prop.name.toLowerCase();
        const variants = byLower.get(lower) ?? new Map();
        const entry = variants.get(prop.name) ?? { count: 0, devices: new Map<number, string>() };
        entry.count += 1;
        entry.devices.set(device.id, device.displayName);
        variants.set(prop.name, entry);
        const byNameEntry = byName.get(prop.name) ?? { count: 0, devices: new Map<number, string>() };
        byNameEntry.count += 1;
        byNameEntry.devices.set(device.id, device.displayName);
        byName.set(prop.name, byNameEntry);
        byLower.set(lower, variants);
      });
    });

    const stats: PropertyStats[] = [];
    byLower.forEach((variants, lower) => {
      const variantList = Array.from(variants.entries())
        .map(([name, entry]) => ({
          name,
          count: entry.count,
          devices: Array.from(entry.devices.entries()).map(([id, displayName]) => ({
            id,
            name: displayName
          }))
        }))
        .sort((a, b) => b.count - a.count);
      if (variantList.length <= 1) {
        return;
      }
      const canonical = variantList[0].name;
      const total = variantList.reduce((sum, v) => sum + v.count, 0);
      const outliers = variantList.slice(1);
      stats.push({
        key: lower,
        canonical,
        total,
        variants: variantList,
        outliers
      });
    });

    return stats.sort((a, b) => b.outliers.length - a.outliers.length);
  }, [devices]);

  const misspellings = useMemo(() => {
    const names = new Map<string, { count: number; devices: Map<number, string> }>();
    devices.forEach((device) => {
      (device.customProperties || []).forEach((prop) => {
        if (!prop?.name) return;
        const entry = names.get(prop.name) ?? { count: 0, devices: new Map<number, string>() };
        entry.count += 1;
        entry.devices.set(device.id, device.displayName);
        names.set(prop.name, entry);
      });
    });

    const unique = Array.from(names.keys());
    const normalized = unique.map((name) => ({ name, lower: name.toLowerCase() }));
    const results: Misspelling[] = [];

    const distance = (a: string, b: string) => {
      const al = a.length;
      const bl = b.length;
      if (Math.abs(al - bl) > 2) return 3;
      const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
      for (let i = 0; i <= al; i++) dp[i][0] = i;
      for (let j = 0; j <= bl; j++) dp[0][j] = j;
      for (let i = 1; i <= al; i++) {
        for (let j = 1; j <= bl; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[al][bl];
    };

    const threshold = 2;
    normalized.forEach((candidate) => {
      if (candidate.lower.length < 4) return;
      let best: { name: string; dist: number } | null = null;
      normalized.forEach((target) => {
        if (candidate.name === target.name) return;
        if (candidate.lower === target.lower) return; // casing only
        if (Math.abs(candidate.lower.length - target.lower.length) > threshold) return;
        if (candidate.lower[0] !== target.lower[0]) return;
        const dist = distance(candidate.lower, target.lower);
        if (dist > threshold) return;
        if (!best || dist < best.dist) {
          best = { name: target.name, dist };
        }
      });
      if (!best) return;
      const candidateEntry = names.get(candidate.name);
      const targetEntry = names.get(best.name);
      const candidateCount = candidateEntry?.count ?? 0;
      const targetCount = targetEntry?.count ?? 0;
      if (targetCount <= candidateCount) return;
      results.push({
        name: candidate.name,
        count: candidateCount,
        suggested: best.name,
        suggestedCount: targetCount,
        devices: Array.from(candidateEntry?.devices.entries() ?? []).map(([id, displayName]) => ({
          id,
          name: displayName
        }))
      });
    });

    return results.sort((a, b) => b.suggestedCount - a.suggestedCount);
  }, [devices]);

  const availableValueProps = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((device) => {
      (device.customProperties || []).forEach((prop) => {
        if (prop?.name) set.add(prop.name);
      });
    });
    return Array.from(set).sort();
  }, [devices]);

  const filteredValueProps = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return availableValueProps;
    return availableValueProps.filter((name) => name.toLowerCase().includes(q));
  }, [availableValueProps, valueSearch]);

  const valueIssues = useMemo(() => {
    if (selectedValueProps.length === 0) {
      return { casingIssues: [], misspellings: [] as ValueMisspelling[] };
    }
    const selectedSet = new Set(selectedValueProps);
    const valueByProp = new Map<string, Map<string, { count: number; devices: Map<number, string> }>>();

    devices.forEach((device) => {
      (device.customProperties || []).forEach((prop) => {
        if (!prop?.name) return;
        if (!selectedSet.has(prop.name)) return;
        if (prop.value === undefined || prop.value === null) return;
        const propMap = valueByProp.get(prop.name) ?? new Map();
        const entry = propMap.get(prop.value) ?? { count: 0, devices: new Map<number, string>() };
        entry.count += 1;
        entry.devices.set(device.id, device.displayName);
        propMap.set(prop.value, entry);
        valueByProp.set(prop.name, propMap);
      });
    });

    const casingIssues: ValueCasingIssue[] = [];
    const misspellings: ValueMisspelling[] = [];

    const distance = (a: string, b: string) => {
      const al = a.length;
      const bl = b.length;
      if (Math.abs(al - bl) > 2) return 3;
      const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
      for (let i = 0; i <= al; i++) dp[i][0] = i;
      for (let j = 0; j <= bl; j++) dp[0][j] = j;
      for (let i = 1; i <= al; i++) {
        for (let j = 1; j <= bl; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[al][bl];
    };

    valueByProp.forEach((values, propName) => {
      const byLower = new Map<string, Array<{ value: string; count: number; devices: Array<{ id: number; name: string }> }>>();
      values.forEach((entry, value) => {
        const key = String(value).toLowerCase();
        const list = byLower.get(key) ?? [];
        list.push({
          value,
          count: entry.count,
          devices: Array.from(entry.devices.entries()).map(([id, name]) => ({ id, name }))
        });
        byLower.set(key, list);
      });

      byLower.forEach((variants) => {
        if (variants.length <= 1) return;
        variants.sort((a, b) => b.count - a.count);
        const canonical = variants[0].value;
        casingIssues.push({
          propName,
          canonical,
          variants,
          outliers: variants.slice(1)
        });
      });

      const valueList = Array.from(values.entries()).map(([value, entry]) => ({
        value,
        count: entry.count,
        devices: Array.from(entry.devices.entries()).map(([id, name]) => ({ id, name }))
      }));
      const normalized = valueList.map((v) => ({ value: String(v.value), lower: String(v.value).toLowerCase() }));
      const threshold = 2;

      normalized.forEach((candidate) => {
        if (candidate.lower.length < 4) return;
        let best: { value: string; dist: number } | null = null;
        normalized.forEach((target) => {
          if (candidate.value === target.value) return;
          if (candidate.lower === target.lower) return;
          if (Math.abs(candidate.lower.length - target.lower.length) > threshold) return;
          if (candidate.lower[0] !== target.lower[0]) return;
          const dist = distance(candidate.lower, target.lower);
          if (dist > threshold) return;
          if (!best || dist < best.dist) {
            best = { value: target.value, dist };
          }
        });
        if (!best) return;
        const candidateEntry = valueList.find((v) => v.value === candidate.value);
        const targetEntry = valueList.find((v) => v.value === best!.value);
        if (!candidateEntry || !targetEntry) return;
        if (targetEntry.count <= candidateEntry.count) return;
        misspellings.push({
          propName,
          value: candidate.value,
          count: candidateEntry.count,
          suggested: best.value,
          suggestedCount: targetEntry.count,
          devices: candidateEntry.devices
        });
      });
    });

    return { casingIssues, misspellings };
  }, [devices, selectedValueProps]);

  const normalizedOutputFilter = outputFilter.trim().toLowerCase();
  const filteredProperties = useMemo(() => properties, [properties]);

  const filteredMisspellings = useMemo(() => {
    return misspellings;
  }, [misspellings]);

  const filteredValueCasing = useMemo(() => {
    const q = normalizedOutputFilter;
    if (!q) return valueIssues.casingIssues;
    return valueIssues.casingIssues.filter((issue) =>
      issue.propName.toLowerCase().includes(q) ||
      issue.variants.some((v) => String(v.value).toLowerCase().includes(q))
    );
  }, [valueIssues.casingIssues, normalizedOutputFilter]);

  const filteredValueMisspellings = useMemo(() => {
    const q = normalizedOutputFilter;
    if (!q) return valueIssues.misspellings;
    return valueIssues.misspellings.filter((row) =>
      row.propName.toLowerCase().includes(q) ||
      String(row.value).toLowerCase().includes(q) ||
      String(row.suggested).toLowerCase().includes(q)
    );
  }, [valueIssues.misspellings, normalizedOutputFilter]);

  const combinedNameIssues = useMemo(() => {
    const items: Array<
      | { type: "casing"; key: string; data: PropertyStats }
      | { type: "misspelling"; key: string; data: Misspelling }
    > = [];
    filteredProperties.forEach((prop) => items.push({ type: "casing", key: prop.key, data: prop }));
    filteredMisspellings.forEach((row) =>
      items.push({ type: "misspelling", key: `${row.name}->${row.suggested}`, data: row })
    );
    const filtered = normalizedOutputFilter
      ? items.filter((item) => {
          if (item.type === "casing") {
            const data = item.data as PropertyStats;
            return data.variants.some((v) => v.name.toLowerCase().includes(normalizedOutputFilter));
          }
          const data = item.data as Misspelling;
          return (
            data.name.toLowerCase().includes(normalizedOutputFilter) ||
            data.suggested.toLowerCase().includes(normalizedOutputFilter)
          );
        })
      : items;
    return filtered;
  }, [filteredProperties, filteredMisspellings, normalizedOutputFilter]);

  const combinedValueIssues = useMemo(() => {
    const items: Array<
      | { type: "value-casing"; key: string; data: ValueCasingIssue }
      | { type: "value-misspelling"; key: string; data: ValueMisspelling }
    > = [];
    filteredValueCasing.forEach((issue) =>
      items.push({ type: "value-casing", key: `${issue.propName}:${issue.canonical}`, data: issue })
    );
    filteredValueMisspellings.forEach((row) =>
      items.push({ type: "value-misspelling", key: `${row.propName}:${row.value}->${row.suggested}`, data: row })
    );
    const filtered = normalizedOutputFilter
      ? items.filter((item) => {
          if (item.type === "value-casing") {
            const data = item.data as ValueCasingIssue;
            return data.variants.some((v) => String(v.value).toLowerCase().includes(normalizedOutputFilter));
          }
          const data = item.data as ValueMisspelling;
          return (
            String(data.value).toLowerCase().includes(normalizedOutputFilter) ||
            String(data.suggested).toLowerCase().includes(normalizedOutputFilter)
          );
        })
      : items;
    return filtered;
  }, [filteredValueCasing, filteredValueMisspellings, normalizedOutputFilter]);

  if (devices.length === 0) {
    return (
      <div className="panel">
        <h2>Consolidation</h2>
        <p className="muted">Load devices to see property casing consolidation hints.</p>
      </div>
    );
  }

  const deviceById = useMemo(() => {
    const map = new Map<number, typeof devices[number]>();
    devices.forEach((device) => map.set(device.id, device));
    return map;
  }, [devices]);

  const getCustomPropValue = (deviceId: number, propName: string) => {
    const device = deviceById.get(deviceId);
    if (!device) return null;
    const match = (device.customProperties || []).find((prop) => prop.name === propName);
    return match?.value ?? null;
  };

  const runFix = async (
    issueKey: string,
    changes: Array<{ deviceId: number; deviceName?: string; fromName: string; toName: string; value: string }>
  ) => {
    if (changes.length === 0) return;
    if (!canFix) {
      setStatus("Fix failed: portal credentials are required.");
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        "This will update device properties in your LogicMonitor portal (custom properties only).\\n\\n" +
        "We will delete the old property name and then add the corrected one for each device in this batch.\\n" +
        "Proceed?"
      );
      if (!ok) {
        return;
      }
    }
    cancelRef.current = false;
    setIsRunning(true);
    setCompleted(false);
    setStatus(dryRun ? "Dry run in progress..." : "Applying property fixes...");
    setLogs([]);
    setRunRunningByKey((prev) => ({ ...prev, [issueKey]: true }));
    setRunStatusByKey((prev) => ({ ...prev, [issueKey]: dryRun ? "Dry run in progress..." : "Applying property fixes..." }));
    setRunLogsByKey((prev) => ({ ...prev, [issueKey]: [] }));
    try {
      const batchSize = 25;
      let processed = 0;
      for (let start = 0; start < changes.length; start += batchSize) {
        if (cancelRef.current) {
          setStatus("Cancelled.");
          setRunStatusByKey((prev) => ({ ...prev, [issueKey]: "Cancelled." }));
          return;
        }
        const chunk = changes.slice(start, start + batchSize);
        const response = await postJSON<{
          logs?: string[];
          results?: Array<{ deviceId: number; status: string }>;
        }>("/api/lm/normalize-properties", {
          creds,
          dryRun,
          debug: debugMode,
          changes: chunk
        });
        processed += chunk.length;
        if (response.logs?.length) {
          setLogs((prev) => [...prev, ...response.logs!]);
          setRunLogsByKey((prev) => ({
            ...prev,
            [issueKey]: [...(prev[issueKey] || []), ...response.logs!]
          }));
        }
        const msg = `${dryRun ? "Dry run" : "Applying"}... ${processed}/${changes.length}`;
        setStatus(msg);
        setRunStatusByKey((prev) => ({ ...prev, [issueKey]: msg }));
      }
      setStatus(dryRun ? "Dry run complete." : "Property fixes applied.");
      setCompleted(true);
      setRunStatusByKey((prev) => ({ ...prev, [issueKey]: dryRun ? "Dry run complete." : "Property fixes applied." }));
    } catch (err) {
      const msg = `Fix failed: ${(err as Error).message}`;
      setStatus(msg);
      setRunStatusByKey((prev) => ({ ...prev, [issueKey]: msg }));
    } finally {
      setIsRunning(false);
      setRunRunningByKey((prev) => ({ ...prev, [issueKey]: false }));
    }
  };

  return (
    <div className="panel">
      <h2>Property Consolidation</h2>
      <p className="muted">
        This checks custom properties only (system/auto ignored) and highlights casing variants.
      </p>

      <div className="section" style={{ marginTop: 12 }}>
        <div className="view-toggle" style={{ width: "fit-content" }}>
          <button
            className={`view-toggle-btn ${activeSection === "names" ? "active" : ""}`}
            onClick={() => setActiveSection("names")}
            type="button"
          >
            Property Names
          </button>
          <button
            className={`view-toggle-btn ${activeSection === "values" ? "active" : ""}`}
            onClick={() => setActiveSection("values")}
            type="button"
          >
            Property Values
          </button>
        </div>
      </div>
      <div className="section" style={{ marginTop: 6 }}>
        <div className="view-toggle" style={{ width: "fit-content" }}>
          <button
            className={`view-toggle-btn ${activeIssue === "casing" ? "active" : ""}`}
            onClick={() => setActiveIssue("casing")}
            type="button"
          >
            Casing
          </button>
          <button
            className={`view-toggle-btn ${activeIssue === "misspelling" ? "active" : ""}`}
            onClick={() => setActiveIssue("misspelling")}
            type="button"
          >
            Misspelling
          </button>
        </div>
      </div>

      {activeSection === "values" && (
        <div className="section">
          <label className="label">Value Checks (select properties)</label>
          <div style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxHeight: 220,
            overflowY: "auto",
            padding: 10,
            background: "var(--bg-secondary)",
            borderRadius: 10,
            border: "1px solid var(--border)"
          }}>
            <input
              className="input"
              value={valueSearch}
              onChange={(e) => setValueSearch(e.target.value)}
              placeholder="Filter properties for value checks"
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {filteredValueProps.map((name) => {
                const checked = selectedValueProps.includes(name);
                return (
                  <label
                    key={`value-prop-${name}`}
                    className={`pill ${checked ? "active" : ""}`}
                    style={{ cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setSelectedValueProps((prev) =>
                          next ? [...prev, name] : prev.filter((item) => item !== name)
                        );
                      }}
                      style={{ marginRight: 6 }}
                    />
                    {name}
                  </label>
                );
              })}
              {filteredValueProps.length === 0 && (
                <span className="muted">No matching properties.</span>
              )}
            </div>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            Value casing/misspelling checks run only on selected properties.
          </p>
        </div>
      )}

      <div className="section" style={{ marginTop: 8 }}>
        <label className="label">Filter Output</label>
        <input
          className="input"
          value={outputFilter}
          onChange={(e) => setOutputFilter(e.target.value)}
          placeholder="Filter casing/misspelling output"
        />
      </div>

      <div className="section">
        {!canFix && (
          <p className="muted" style={{ marginTop: 6 }}>
            Portal credentials are required to apply fixes.
          </p>
        )}
      </div>
      <div className="section">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          <span>Debug logging</span>
        </label>
      </div>
      <div className="section">
        <label className="label">Fix Mode</label>
        <div className="view-toggle" style={{ width: "fit-content" }}>
          <button
            className={`view-toggle-btn ${dryRun ? "active" : ""}`}
            type="button"
            onClick={() => setDryRun(true)}
            disabled={isRunning}
          >
            Dry Run
          </button>
          <button
            className={`view-toggle-btn ${!dryRun ? "active" : ""}`}
            type="button"
            onClick={() => setDryRun(false)}
            disabled={!canFix || isRunning}
          >
            Apply
          </button>
          {isRunning && (
            <button
              className="view-toggle-btn"
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {activeSection === "names" && activeIssue === "casing" && filteredProperties.length === 0 ? (
        <div className="notice info" style={{ marginTop: 16 }}>
          No casing conflicts or misspellings found for custom properties.
        </div>
      ) : activeSection === "names" && activeIssue === "casing" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {combinedNameIssues.map((issue) => {
            if (issue.type === "casing") {
              const prop = issue.data as PropertyStats;
              return (
                <details key={`case-${issue.key}`} className="notice" style={{ margin: 0 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    [Casing] {prop.canonical} — {prop.outliers.length} variant{prop.outliers.length !== 1 ? "s" : ""}
                  </summary>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div><strong>Canonical:</strong> <code>{prop.canonical}</code></div>
                    <div style={{ marginTop: 6 }}>
                      <strong>Variants:</strong>{" "}
                      {prop.variants.map((v, idx) => (
                        <span key={`${prop.key}-${v.name}`}>
                          {idx > 0 ? " · " : ""}
                          <code>{v.name}</code> ({v.count})
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Outlier devices:</strong>
                      {prop.outliers.map((variant) => (
                        <div key={`${prop.key}-${variant.name}`} style={{ marginTop: 6 }}>
                          <code>{variant.name}</code> — {variant.count} device{variant.count !== 1 ? "s" : ""}
                          <button
                            className="button secondary"
                            type="button"
                            style={{ marginLeft: 8 }}
                            disabled={!canFix}
                            onClick={() => {
                              const changes = variant.devices
                                .map((device) => {
                                  const value = getCustomPropValue(device.id, variant.name);
                                  if (value === null || value === undefined) return null;
                              return {
                                deviceId: device.id,
                                deviceName: device.name,
                                fromName: variant.name,
                                toName: prop.canonical,
                                value
                              };
                                })
                                .filter(Boolean) as Array<{ deviceId: number; fromName: string; toName: string; value: string }>;
                              runFix(`name-casing-${prop.key}-${variant.name}`, changes);
                            }}
                          >
                            Push updates to Portal
                          </button>
                          {runRunningByKey[`name-casing-${prop.key}-${variant.name}`] && (
                            <button
                              className="button secondary"
                              type="button"
                              style={{ marginLeft: 8 }}
                              onClick={() => {
                                cancelRef.current = true;
                              }}
                            >
                              Stop
                            </button>
                          )}
                          <div style={{ color: "var(--ink-tertiary)", marginTop: 4 }}>
                            {variant.devices.slice(0, MAX_DEVICE_PREVIEW).map((d) => d.name).join(", ")}
                            {variant.devices.length > MAX_DEVICE_PREVIEW && (
                              <> …and {variant.devices.length - MAX_DEVICE_PREVIEW} more</>
                            )}
                          </div>
                          {(runStatusByKey[`name-casing-${prop.key}-${variant.name}`] || runLogsByKey[`name-casing-${prop.key}-${variant.name}`]?.length) && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {runRunningByKey[`name-casing-${prop.key}-${variant.name}`] && <span className="loading" />}
                                <strong>{runStatusByKey[`name-casing-${prop.key}-${variant.name}`]}</strong>
                              </div>
                              <details open={runRunningByKey[`name-casing-${prop.key}-${variant.name}`]} style={{ marginTop: 6 }}>
                                <summary style={{ cursor: "pointer" }}><strong>Fix Log</strong></summary>
                                <pre style={{ marginTop: 6 }}>
                                  {(runLogsByKey[`name-casing-${prop.key}-${variant.name}`] || []).join("\n") || "Running..."}
                                </pre>
                              </details>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              );
            }

            if (issue.type === "misspelling") {
              const row = issue.data as Misspelling;
              return (
                <details key={`miss-${issue.key}`} className="notice" style={{ margin: 0 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    [Misspelling] <code>{row.name}</code> → <code>{row.suggested}</code>
                  </summary>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div>
                      <strong>Counts:</strong> <code>{row.name}</code> ({row.count}) ·{" "}
                      <code>{row.suggested}</code> ({row.suggestedCount})
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Outlier devices:</strong>
                      <button
                        className="button secondary"
                        type="button"
                        style={{ marginLeft: 8 }}
                        disabled={!canFix}
                        onClick={() => {
                          const changes = row.devices
                            .map((device) => {
                              const value = getCustomPropValue(device.id, row.name);
                              if (value === null || value === undefined) return null;
                              return {
                                deviceId: device.id,
                                deviceName: device.name,
                                fromName: row.name,
                                toName: row.suggested,
                                value
                              };
                            })
                            .filter(Boolean) as Array<{ deviceId: number; fromName: string; toName: string; value: string }>;
                          runFix(`name-miss-${row.name}->${row.suggested}`, changes);
                        }}
                      >
                        Push updates to Portal
                      </button>
                      {runRunningByKey[`name-miss-${row.name}->${row.suggested}`] && (
                        <button
                          className="button secondary"
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            cancelRef.current = true;
                          }}
                        >
                          Stop
                        </button>
                      )}
                      <div style={{ color: "var(--ink-tertiary)", marginTop: 4 }}>
                        {row.devices.slice(0, MAX_DEVICE_PREVIEW).map((d) => d.name).join(", ")}
                        {row.devices.length > MAX_DEVICE_PREVIEW && (
                          <> …and {row.devices.length - MAX_DEVICE_PREVIEW} more</>
                        )}
                      </div>
                      {(runStatusByKey[`name-miss-${row.name}->${row.suggested}`] || runLogsByKey[`name-miss-${row.name}->${row.suggested}`]?.length) && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {runRunningByKey[`name-miss-${row.name}->${row.suggested}`] && <span className="loading" />}
                            <strong>{runStatusByKey[`name-miss-${row.name}->${row.suggested}`]}</strong>
                          </div>
                          <details open={runRunningByKey[`name-miss-${row.name}->${row.suggested}`]} style={{ marginTop: 6 }}>
                            <summary style={{ cursor: "pointer" }}><strong>Fix Log</strong></summary>
                            <pre style={{ marginTop: 6 }}>
                              {(runLogsByKey[`name-miss-${row.name}->${row.suggested}`] || []).join("\n") || "Running..."}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            }
            return null;
          })}
        </div>
      ) : activeSection === "names" && activeIssue === "misspelling" && filteredMisspellings.length === 0 ? (
        <div className="notice info" style={{ marginTop: 16 }}>
          No misspellings found for custom properties.
        </div>
      ) : activeSection === "names" && activeIssue === "misspelling" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {combinedNameIssues.map((issue) => {
            if (issue.type === "misspelling") {
              const row = issue.data as Misspelling;
              return (
                <details key={`miss-${issue.key}`} className="notice" style={{ margin: 0 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    [Misspelling] <code>{row.name}</code> → <code>{row.suggested}</code>
                  </summary>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div>
                      <strong>Counts:</strong> <code>{row.name}</code> ({row.count}) ·{" "}
                      <code>{row.suggested}</code> ({row.suggestedCount})
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Outlier devices:</strong>
                      <button
                        className="button secondary"
                        type="button"
                        style={{ marginLeft: 8 }}
                        disabled={!canFix}
                        onClick={() => {
                          const changes = row.devices
                            .map((device) => {
                              const value = getCustomPropValue(device.id, row.name);
                              if (value === null || value === undefined) return null;
                              return {
                                deviceId: device.id,
                                deviceName: device.name,
                                fromName: row.name,
                                toName: row.suggested,
                                value
                              };
                            })
                            .filter(Boolean) as Array<{ deviceId: number; deviceName?: string; fromName: string; toName: string; value: string }>;
                          runFix(`name-miss-${row.name}->${row.suggested}`, changes);
                        }}
                      >
                        Push updates to Portal
                      </button>
                      {runRunningByKey[`name-miss-${row.name}->${row.suggested}`] && (
                        <button
                          className="button secondary"
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            cancelRef.current = true;
                          }}
                        >
                          Stop
                        </button>
                      )}
                      <div style={{ color: "var(--ink-tertiary)", marginTop: 4 }}>
                        {row.devices.slice(0, MAX_DEVICE_PREVIEW).map((d) => d.name).join(", ")}
                        {row.devices.length > MAX_DEVICE_PREVIEW && (
                          <> …and {row.devices.length - MAX_DEVICE_PREVIEW} more</>
                        )}
                      </div>
                      {(runStatusByKey[`name-miss-${row.name}->${row.suggested}`] || runLogsByKey[`name-miss-${row.name}->${row.suggested}`]?.length) && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {runRunningByKey[`name-miss-${row.name}->${row.suggested}`] && <span className="loading" />}
                            <strong>{runStatusByKey[`name-miss-${row.name}->${row.suggested}`]}</strong>
                          </div>
                          <details open={runRunningByKey[`name-miss-${row.name}->${row.suggested}`]} style={{ marginTop: 6 }}>
                            <summary style={{ cursor: "pointer" }}><strong>Fix Log</strong></summary>
                            <pre style={{ marginTop: 6 }}>
                              {(runLogsByKey[`name-miss-${row.name}->${row.suggested}`] || []).join("\n") || "Running..."}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            }
            return null;
          })}
        </div>
      ) : activeSection === "values" && activeIssue === "casing" && filteredValueCasing.length === 0 ? (
        <div className="notice info" style={{ marginTop: 16 }}>
          No casing conflicts found for selected property values.
        </div>
      ) : activeSection === "values" && activeIssue === "casing" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {combinedValueIssues.map((issue) => {
            if (issue.type === "value-casing") {
              const data = issue.data as ValueCasingIssue;
              return (
                <details key={`val-case-${issue.key}`} className="notice" style={{ margin: 0 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    [Value Casing] <code>{data.propName}</code> — {data.outliers.length} variant{data.outliers.length !== 1 ? "s" : ""}
                  </summary>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div><strong>Canonical value:</strong> <code>{data.canonical}</code></div>
                    <div style={{ marginTop: 6 }}>
                      <strong>Value variants:</strong>{" "}
                      {data.variants.map((v, idx) => (
                        <span key={`${data.propName}-${v.value}`}>
                          {idx > 0 ? " · " : ""}
                          <code>{v.value}</code> ({v.count})
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Outlier devices:</strong>
                      {data.outliers.map((variant) => (
                        <div key={`${data.propName}-${variant.value}`} style={{ marginTop: 6 }}>
                          <code>{variant.value}</code> — {variant.count} device{variant.count !== 1 ? "s" : ""}
                          <button
                            className="button secondary"
                            type="button"
                            style={{ marginLeft: 8 }}
                            disabled={!canFix}
                            onClick={() => {
                              const changes = variant.devices
                                .map((device) => ({
                                  deviceId: device.id,
                                  deviceName: device.name,
                                  fromName: data.propName,
                                  toName: data.propName,
                                  value: data.canonical
                                }));
                              runFix(`value-casing-${data.propName}-${variant.value}`, changes);
                            }}
                          >
                            Push updates to Portal
                          </button>
                          {runRunningByKey[`value-casing-${data.propName}-${variant.value}`] && (
                            <button
                              className="button secondary"
                              type="button"
                              style={{ marginLeft: 8 }}
                              onClick={() => {
                                cancelRef.current = true;
                              }}
                            >
                              Stop
                            </button>
                          )}
                          <div style={{ color: "var(--ink-tertiary)", marginTop: 4 }}>
                            {variant.devices.slice(0, MAX_DEVICE_PREVIEW).map((d) => d.name).join(", ")}
                            {variant.devices.length > MAX_DEVICE_PREVIEW && (
                              <> …and {variant.devices.length - MAX_DEVICE_PREVIEW} more</>
                            )}
                          </div>
                          {(runStatusByKey[`value-casing-${data.propName}-${variant.value}`] || runLogsByKey[`value-casing-${data.propName}-${variant.value}`]?.length) && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {runRunningByKey[`value-casing-${data.propName}-${variant.value}`] && <span className="loading" />}
                                <strong>{runStatusByKey[`value-casing-${data.propName}-${variant.value}`]}</strong>
                              </div>
                              <details open={runRunningByKey[`value-casing-${data.propName}-${variant.value}`]} style={{ marginTop: 6 }}>
                                <summary style={{ cursor: "pointer" }}><strong>Fix Log</strong></summary>
                                <pre style={{ marginTop: 6 }}>
                                  {(runLogsByKey[`value-casing-${data.propName}-${variant.value}`] || []).join("\n") || "Running..."}
                                </pre>
                              </details>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              );
            }
            return null;
          })}
        </div>
      ) : activeSection === "values" && activeIssue === "misspelling" && filteredValueMisspellings.length === 0 ? (
        <div className="notice info" style={{ marginTop: 16 }}>
          No misspellings found for selected property values.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {combinedValueIssues.map((issue) => {
            if (issue.type === "value-misspelling") {
              const data = issue.data as ValueMisspelling;
              return (
                <details key={`val-miss-${issue.key}`} className="notice" style={{ margin: 0 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    [Value Misspelling] <code>{data.propName}</code>: <code>{data.value}</code> → <code>{data.suggested}</code>
                  </summary>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div>
                      <strong>Counts:</strong> <code>{data.value}</code> ({data.count}) ·{" "}
                      <code>{data.suggested}</code> ({data.suggestedCount})
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Outlier devices:</strong>
                      <button
                        className="button secondary"
                        type="button"
                        style={{ marginLeft: 8 }}
                        disabled={!canFix}
                        onClick={() => {
                          const changes = data.devices.map((device) => ({
                            deviceId: device.id,
                            deviceName: device.name,
                            fromName: data.propName,
                            toName: data.propName,
                            value: data.suggested
                          }));
                          runFix(`value-miss-${data.propName}-${data.value}->${data.suggested}`, changes);
                        }}
                      >
                        Push updates to Portal
                      </button>
                      {runRunningByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`] && (
                        <button
                          className="button secondary"
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            cancelRef.current = true;
                          }}
                        >
                          Stop
                        </button>
                      )}
                      <div style={{ color: "var(--ink-tertiary)", marginTop: 4 }}>
                        {data.devices.slice(0, MAX_DEVICE_PREVIEW).map((d) => d.name).join(", ")}
                        {data.devices.length > MAX_DEVICE_PREVIEW && (
                          <> …and {data.devices.length - MAX_DEVICE_PREVIEW} more</>
                        )}
                      </div>
                      {(runStatusByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`] || runLogsByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`]?.length) && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {runRunningByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`] && <span className="loading" />}
                            <strong>{runStatusByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`]}</strong>
                          </div>
                          <details open={runRunningByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`]} style={{ marginTop: 6 }}>
                            <summary style={{ cursor: "pointer" }}><strong>Fix Log</strong></summary>
                            <pre style={{ marginTop: 6 }}>
                              {(runLogsByKey[`value-miss-${data.propName}-${data.value}->${data.suggested}`] || []).join("\n") || "Running..."}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            }
            return null;
          })}
        </div>
      )}

    </div>
  );
}
