"use client";

import { useMemo, useState, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppState } from "../store/appStore";
import { buildTree, generateGroups } from "../lib/generator";
import { diffGroups } from "../lib/diff";
import type { TreeNode } from "../lib/types";

// Dynamic import for 3D canvas to avoid SSR issues with Three.js
const Tree3DCanvas = dynamic(
  () => import("./tree3d/Tree3DWrapper"),
  { ssr: false }
);

type ViewMode = "2d" | "3d";

export interface TreePreviewHandle {
  generate: () => void;
}

export const TreePreview = forwardRef<TreePreviewHandle, object>(function TreePreview(_props, ref) {
  const {
    devices,
    groups,
    schema,
    schemaStatic,
    includeCaseVariants,
    normalizationKeyPrefixes,
    parentGroup,
    focusCustomers,
    excludeCustomers,
    conflicts,
    selectedLeaf,
    tree,
    generated,
    diffs
  } = useAppState();
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const max3dNodes = 300;

  const nodeCount = useMemo(() => {
    if (!tree) return 0;
    let count = 0;
    const walk = (node: TreeNode) => {
      count += 1;
      if (collapsed[node.fullPath]) {
        return;
      }
      node.children.forEach(walk);
    };
    walk(tree);
    return count;
  }, [tree, collapsed]);

  const handleGenerate = () => {
    setStatus("Generating...");
    const { groups: generated, conflicts: conflictPaths } = generateGroups(devices, schema, {
      parentGroup,
      focusCustomers,
      excludeCustomers,
      staticSchema: schemaStatic,
      includeCaseVariants,
      normalizationKeyPrefixes,
      includeCaseVariantLayers: schema.caseVariantLayers || {},
      includeNormalizationKeyLayers: schema.normalizationKeyLayers || {}
    });
    dispatch({ type: "SET_GENERATED", payload: { generated, conflicts: conflictPaths } });
    const portalPaths = groups
      .map((g) => g.fullPath)
      .filter((path) => matchesCustomerFilter(path, parentGroup, focusCustomers, excludeCustomers));
    // Pass schema depth to only show groups matching the schema structure
    const schemaDepth = schema.layers.length;
    const nextTree = buildTree(parentGroup, generated, portalPaths, schemaDepth);
    dispatch({ type: "SET_TREE", payload: nextTree });
    dispatch({ type: "SET_DIFFS", payload: diffGroups(generated, groups) });
    const nextCollapsed: Record<string, boolean> = {};
    const walk = (node: TreeNode) => {
      if (node.children.length > 0) {
        nextCollapsed[node.fullPath] = true;
      }
      node.children.forEach(walk);
    };
    walk(nextTree);
    setCollapsed(nextCollapsed);
    setStatus(`Generated ${generated.length} groups.`);
  };

  // Expose generate function to parent via ref
  useImperativeHandle(ref, () => ({
    generate: handleGenerate
  }));

  const toggle = (path: string) => {
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleSelect = (fullPath: string) => {
    dispatch({ type: "SET_SELECTED_LEAF", payload: fullPath });
  };

  const statusByPath = useMemo(() => {
    if (!diffs) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();
    diffs.missing.forEach((row) => map.set(row.fullPath, "missing"));
    diffs.needsUpdate.forEach((row) => map.set(row.fullPath, "update"));
    diffs.matches.forEach((row) => map.set(row.fullPath, "match"));
    diffs.staticInPortal.forEach((row) => map.set(row.fullPath, "static"));
    return map;
  }, [diffs]);

  const renderNode = (node: TreeNode, depth = 0, isLast = true) => (
    <div key={node.fullPath} style={{ marginLeft: depth * 16, position: "relative" }}>
      {depth > 0 && (
        <>
          <span
            className="tree-line"
            style={{ left: -12, top: 0, bottom: isLast ? "50%" : 0 }}
          />
          <span className="tree-line-horizontal" style={{ left: -12, top: "50%" }} />
        </>
      )}
      <div
        className="tree-node"
        onClick={() => dispatch({ type: "SET_SELECTED_LEAF", payload: node.fullPath })}
        style={{ background: selectedLeaf === node.fullPath ? "#fff5d6" : undefined }}
      >
        {node.children.length > 0 && (
          <button
            type="button"
            className="button secondary"
            style={{ padding: "2px 6px" }}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.fullPath);
            }}
          >
            {collapsed[node.fullPath] ? "+" : "–"}
          </button>
        )}
        <span className={`tree-pill layer-${Math.min(depth, 3)}`}>{node.name}</span>
        {statusByPath.get(node.fullPath) === "missing" && (
          <span className="tree-status missing">
            <span className="status-icon">+</span>
            <span>New Group</span>
          </span>
        )}
        {statusByPath.get(node.fullPath) === "update" && (
          <span className="tree-status update">
            <span className="status-icon">↺</span>
            <span>Needs Update</span>
          </span>
        )}
        {statusByPath.get(node.fullPath) === "static" && (
          <span className="tree-status static">
            <span className="status-icon">■</span>
            <span>Static</span>
          </span>
        )}
        {statusByPath.get(node.fullPath) === "match" && (
          <span className="tree-status match">
            <span className="status-icon">✓</span>
            <span>Synced</span>
          </span>
        )}
      </div>
      {!collapsed[node.fullPath] &&
        node.children.map((child, idx) =>
          renderNode(child, depth + 1, idx === node.children.length - 1)
        )}
    </div>
  );

  const renderAppliesToDiff = (base: string, value: string) => {
    if (base === value) {
      return <span>{value || "(empty appliesTo)"}</span>;
    }
    if (!base || !value) {
      return (
        <span>
          {value || "(empty appliesTo)"}
        </span>
      );
    }
    let start = 0;
    const maxStart = Math.min(base.length, value.length);
    while (start < maxStart && base[start] === value[start]) {
      start += 1;
    }
    let endBase = base.length - 1;
    let endValue = value.length - 1;
    while (endBase >= start && endValue >= start && base[endBase] === value[endValue]) {
      endBase -= 1;
      endValue -= 1;
    }
    const prefix = value.slice(0, start);
    const changed = value.slice(start, endValue + 1);
    const suffix = value.slice(endValue + 1);
    return (
      <span>
        {prefix}
        {changed && <mark className="diff-highlight">{changed}</mark>}
        {suffix}
      </span>
    );
  };

  return (
    <div className="panel">
      <h2>Preview Tree</h2>
      <div className="section">
        <div className="muted"><strong>Parent:</strong> {parentGroup || "n/a"}</div>
        <div className="muted">
          <strong>Schema:</strong>{" "}
          {schema.layers
            .map((layer, idx) => {
              const parts = layer.parts.map((pill, pIdx) => {
                const connector = pIdx < layer.parts.length - 1 ? ` ${pill.connectorToNext || "OR"} ` : "";
                return `${pill.key}${connector}`;
              });
              const layerLabel = parts.join("").trim() || "empty";
              const sep = idx < schema.layerSeparators.length ? ` ${schema.layerSeparators[idx]} ` : "";
              return `${layerLabel}${sep}`;
            })
            .join("")
            .trim()}
        </div>
      </div>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="button" onClick={handleGenerate} style={{ gap: 6 }}>
          <span>⚡</span> Generate
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            const next: Record<string, boolean> = {};
            const walk = (node: TreeNode) => {
              next[node.fullPath] = false;
              node.children.forEach(walk);
            };
            if (tree) {
              walk(tree);
            }
            setCollapsed(next);
          }}
        >
          Expand All
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            const next: Record<string, boolean> = {};
            const walk = (node: TreeNode) => {
              if (node.children.length > 0) {
                next[node.fullPath] = true;
              }
              node.children.forEach(walk);
            };
            if (tree) {
              walk(tree);
            }
            setCollapsed(next);
          }}
        >
          Collapse All
        </button>

        {/* View Mode Toggle */}
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === "2d" ? "active" : ""}`}
            onClick={() => setViewMode("2d")}
            type="button"
          >
            2D
          </button>
          <button
            className={`view-toggle-btn ${viewMode === "3d" ? "active" : ""}`}
            onClick={() => setViewMode("3d")}
            type="button"
          >
            3D
          </button>
        </div>
      </div>
      {status && (
        <p className="notice success" style={{ marginBottom: 12 }}>
          ✓ {status}
        </p>
      )}
      {conflicts.length > 0 && (
        <details className="notice error" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            ⚠ Conflicts detected ({conflicts.length})
          </summary>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            {conflicts.map((conflict) => (
              <div key={conflict.path} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{conflict.path}</div>
                <div style={{ color: "var(--ink-tertiary)" }}>
                  {conflict.variants.map((variant, idx) => {
                    const base = conflict.variants[0]?.appliesTo ?? "";
                    return (
                      <span key={`${conflict.path}-${variant.appliesTo}-${idx}`}>
                        {idx > 0 ? " · " : ""}
                        {variant.count}× {renderAppliesToDiff(base, variant.appliesTo || "")}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-tertiary)" }}>
            We keep the first appliesTo for each path and flag the group so you can review differences.
          </div>
        </details>
      )}
      {/* 2D Tree View */}
      {viewMode === "2d" && (
        <div className="tree-container">
          {tree ? renderNode(tree) : (
            <div style={{
              padding: 40,
              textAlign: "center",
              color: "var(--muted)"
            }}>
              <div style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                background: "var(--bg-tertiary)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                border: "1px solid var(--border)"
              }}>
                🌳
              </div>
              <p style={{ fontWeight: 500, marginBottom: 4, color: "var(--ink-secondary)" }}>No tree generated yet</p>
              <p style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>Configure your schema and click Generate</p>
            </div>
          )}
        </div>
      )}

      {/* 3D Tree View */}
      {viewMode === "3d" && (
        tree && nodeCount <= max3dNodes ? (
          <Tree3DCanvas
            tree={tree}
            statusByPath={statusByPath}
            selectedLeaf={selectedLeaf}
            collapsed={collapsed}
            onSelect={handleSelect}
            onToggle={toggle}
          />
        ) : tree ? (
          <div className="tree-3d-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 520 }}>
              <div className="notice error" style={{ marginBottom: 12 }}>
                3D preview is limited to {max3dNodes} nodes. This tree has {nodeCount}.
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 16 }}>
                Switch to the 2D view and select a smaller subset, then regenerate to use 3D.
              </div>
              <button className="button secondary" type="button" onClick={() => setViewMode("2d")}>
                Go to 2D View
              </button>
            </div>
          </div>
        ) : (
          <div className="tree-3d-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: "var(--muted)" }}>
              <div style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                background: "var(--bg-tertiary)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                border: "1px solid var(--border)"
              }}>
                🌳
              </div>
              <p style={{ fontWeight: 500, marginBottom: 4, color: "var(--ink-secondary)" }}>No tree generated yet</p>
              <p style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>Configure your schema and click Generate</p>
            </div>
          </div>
        )
      )}
      {selectedLeaf && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink)" }}>Selected Group</h3>
          {(() => {
            const generatedMatch = generated.find((g) => g.fullPath === selectedLeaf);
            const portal = groups.find((g) => g.fullPath === selectedLeaf);
            const status = statusByPath.get(selectedLeaf);

            // Determine if this group needs any action
            const statusInfo = {
              missing: { label: "New Group", description: "This group does not exist in the portal and will be created.", color: "#a78bfa", bg: "rgba(139, 92, 246, 0.1)", border: "rgba(139, 92, 246, 0.3)" },
              update: { label: "Needs Update", description: "This group exists but has a different appliesTo expression.", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)", border: "rgba(251, 191, 36, 0.3)" },
              match: { label: "Synced", description: "This group is already in sync with the portal. No changes needed.", color: "#34d399", bg: "rgba(52, 211, 153, 0.1)", border: "rgba(52, 211, 153, 0.3)" },
              static: { label: "Static Group", description: "This is a static group in the portal (no appliesTo). No changes will be made.", color: "#9ca3af", bg: "rgba(156, 163, 175, 0.1)", border: "rgba(156, 163, 175, 0.3)" },
            }[status || "match"] || { label: "No Status", description: "Status unknown.", color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)" };

            return (
              <div style={{
                padding: 16,
                background: statusInfo.bg,
                borderRadius: 10,
                border: `1.5px solid ${statusInfo.border}`
              }}>
                {/* Status Banner */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.15)",
                  borderRadius: 6
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: statusInfo.color
                  }} />
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusInfo.color
                  }}>{statusInfo.label}</span>
                  <span style={{
                    fontSize: 12,
                    color: "var(--ink-tertiary)",
                    marginLeft: 4
                  }}>— {statusInfo.description}</span>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    color: statusInfo.color,
                    fontWeight: 600,
                    letterSpacing: "0.5px"
                  }}>Path</span>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    background: "rgba(0, 0, 0, 0.2)",
                    padding: "8px 10px",
                    borderRadius: 6,
                    marginTop: 4,
                    wordBreak: "break-all",
                    color: "var(--ink)"
                  }}>
                    {selectedLeaf}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <span style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      color: "#34d399",
                      fontWeight: 600,
                      letterSpacing: "0.5px"
                    }}>Generated appliesTo</span>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      background: "rgba(0, 0, 0, 0.2)",
                      padding: "8px 10px",
                      borderRadius: 6,
                      marginTop: 4,
                      wordBreak: "break-all",
                      color: generatedMatch?.appliesTo ? "var(--ink)" : "var(--muted)"
                    }}>
                      {generatedMatch?.appliesTo || "n/a"}
                    </div>
                  </div>
                  <div>
                    <span style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      color: "#60a5fa",
                      fontWeight: 600,
                      letterSpacing: "0.5px"
                    }}>Portal appliesTo</span>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      background: "rgba(0, 0, 0, 0.2)",
                      padding: "8px 10px",
                      borderRadius: 6,
                      marginTop: 4,
                      wordBreak: "break-all",
                      color: portal?.appliesTo ? "var(--ink)" : "var(--muted)"
                    }}>
                      {portal?.appliesTo || "n/a"}
                    </div>
                  </div>
                </div>

                {/* Show match indicator for synced groups */}
                {status === "match" && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "rgba(52, 211, 153, 0.15)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#34d399"
                  }}>
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span>The generated and portal appliesTo expressions match exactly.</span>
                  </div>
                )}

                {/* Show static indicator */}
                {status === "static" && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "rgba(156, 163, 175, 0.15)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#9ca3af"
                  }}>
                    <span style={{ fontSize: 16 }}>■</span>
                    <span>Static groups have no appliesTo expression and are managed manually.</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
});

function matchesCustomerFilter(
  groupPath: string,
  parentGroup: string,
  focusCustomers: string[],
  excludeCustomers: string[]
) {
  const prefix = parentGroup.replace(/\/$/, "") + "/";
  if (!groupPath.startsWith(prefix)) {
    return false;
  }
  const remainder = groupPath.slice(prefix.length);
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
}
