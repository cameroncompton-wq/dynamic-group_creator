"use client";

import { useMemo, useRef, useState } from "react";
import { createPill, useAppDispatch, useAppState } from "../store/appStore";
import { buildAppliesTo } from "../lib/generator";
import { LayerDropZone } from "./LayerDropZone";
import { StaticLiteralsEditor } from "./StaticLiteralsEditor";
import type { SchemaDefinition } from "../lib/types";

const makeId = () => Math.random().toString(36).slice(2, 9);

type SchemaExport = {
  version: 1;
  exportedAt: string;
  parentGroup: string;
  focusCustomers: string[];
  excludeCustomers: string[];
  staticSchema: boolean;
  includeCaseVariants: boolean;
  normalizationKeyPrefixes: string[];
  caseVariantLayers?: Record<string, boolean>;
  normalizationKeyLayers?: Record<string, boolean>;
  schema: SchemaDefinition;
};

const normalizeSchema = (schema: SchemaDefinition): SchemaDefinition => {
  const layers = (schema.layers || []).map((layer) => ({
    id: layer.id || makeId(),
    parts: (layer.parts || []).map((pill) => ({
      id: pill.id || makeId(),
      key: pill.key,
      strict: Boolean(pill.strict),
      mode: pill.mode === "eq" ? "eq" : "regex",
      connectorToNext: pill.connectorToNext ?? "OR",
      copyFromFirst: pill.copyFromFirst ?? false
    }))
  }));
  const requiredSeparators = Math.max(layers.length - 1, 0);
  const nextSeparators = (schema.layerSeparators || []).slice(0, requiredSeparators);
  while (nextSeparators.length < requiredSeparators) {
    nextSeparators.push("AND");
  }
  return {
    layers,
    layerSeparators: nextSeparators,
    staticLayerLiterals: schema.staticLayerLiterals || {},
    caseVariantLayers: schema.caseVariantLayers || {},
    normalizationKeyLayers: schema.normalizationKeyLayers || {}
  };
};

export function SchemaBuilder() {
  const {
    parentGroup,
    focusCustomers,
    excludeCustomers,
    propertyNames,
    schema,
    schemaStatic,
    includeCaseVariants,
    normalizationKeyPrefixes,
    groups
  } = useAppState();
  const dispatch = useAppDispatch();

  const [search, setSearch] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [paletteSelection, setPaletteSelection] = useState<string[]>([]);
  const [schemaStatus, setSchemaStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const moveSelected = (name: string, direction: "up" | "down") => {
    setPaletteSelection((prev) => {
      const index = prev.indexOf(name);
      if (index === -1) {
        return prev;
      }
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };
  const paletteProperties = useMemo(() => {
    return propertyNames.slice().sort();
  }, [propertyNames]);

  const filteredProperties = useMemo(() => {
    if (!search) {
      return paletteProperties;
    }
    const lower = search.toLowerCase();
    return paletteProperties.filter((name) => name.toLowerCase().includes(lower));
  }, [paletteProperties, search]);

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exampleNonce, setExampleNonce] = useState(0);
  const exampleAppliesTo = useMemo(() => {
    if (schemaStatic) {
      return "static (no appliesTo)";
    }
    const props = new Map<string, string>();
    schema.layers.forEach((layer) => {
      const first = layer.parts[0]?.key;
      const firstValue = first ? `${first}_value` : "";
      if (first) {
        props.set(first, firstValue);
      }
      layer.parts.forEach((pill) => {
        if (!props.has(pill.key)) {
          props.set(pill.key, `${pill.key}_value`);
        }
      });
    });
    return buildAppliesTo(schema, props, {
      includeCaseVariants,
      normalizationKeyPrefixes,
      includeCaseVariantLayers: schema.caseVariantLayers || {},
      includeNormalizationKeyLayers: schema.normalizationKeyLayers || {}
    }) || "n/a";
  }, [schema, schemaStatic, includeCaseVariants, normalizationKeyPrefixes, exampleNonce]);

  const toggleCaseVariantLayer = (layerId: string, enabled: boolean) => {
    dispatch({
      type: "SET_SCHEMA",
      payload: {
        ...schema,
        caseVariantLayers: {
          ...(schema.caseVariantLayers || {}),
          [layerId]: enabled
        }
      }
    });
  };

  const toggleNormalizationLayer = (layerId: string, enabled: boolean) => {
    dispatch({
      type: "SET_SCHEMA",
      payload: {
        ...schema,
        normalizationKeyLayers: {
          ...(schema.normalizationKeyLayers || {}),
          [layerId]: enabled
        }
      }
    });
  };

  return (
    <div className="panel">
      <h2>Schema Builder</h2>
      <div className="section">
        <div className="actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              const payload: SchemaExport = {
                version: 1,
                exportedAt: new Date().toISOString(),
                parentGroup,
                focusCustomers,
                excludeCustomers,
                staticSchema: schemaStatic,
                includeCaseVariants,
                normalizationKeyPrefixes,
                schema: {
                  ...schema,
                  caseVariantLayers: schema.caseVariantLayers || {},
                  normalizationKeyLayers: schema.normalizationKeyLayers || {}
                }
              };
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "lm-schema.json";
              a.click();
              URL.revokeObjectURL(url);
              setSchemaStatus("Schema exported.");
            }}
          >
            Export Schema
          </button>
          <button
            className="button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Schema
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={async (event) => {
              const inputEl = event.currentTarget;
              const file = inputEl.files?.[0];
              if (!file) {
                return;
              }
              try {
                const text = await file.text();
                const data = JSON.parse(text) as Partial<SchemaExport>;
                if (!data.schema || !Array.isArray(data.schema.layers)) {
                  throw new Error("Invalid schema file.");
                }
                const nextSchema = normalizeSchema(data.schema);
                dispatch({ type: "SET_SCHEMA", payload: nextSchema });
                if (typeof data.parentGroup === "string") {
                  dispatch({ type: "SET_PARENT_GROUP", payload: data.parentGroup });
                }
                if (Array.isArray(data.focusCustomers)) {
                  dispatch({ type: "SET_FOCUS_CUSTOMERS", payload: data.focusCustomers.filter(Boolean) });
                }
                if (Array.isArray(data.excludeCustomers)) {
                  dispatch({ type: "SET_EXCLUDE_CUSTOMERS", payload: data.excludeCustomers.filter(Boolean) });
                }
                if (typeof data.staticSchema === "boolean") {
                  dispatch({ type: "SET_SCHEMA_STATIC", payload: data.staticSchema });
                }
                if (typeof data.includeCaseVariants === "boolean") {
                  dispatch({ type: "SET_INCLUDE_CASE_VARIANTS", payload: data.includeCaseVariants });
                }
                if (Array.isArray(data.normalizationKeyPrefixes)) {
                  dispatch({ type: "SET_NORMALIZATION_KEY_PREFIXES", payload: data.normalizationKeyPrefixes });
                } else if (typeof (data as any).includeNormalizationKeys === "boolean") {
                  // Backward-compat: if old flag is true, set default prefixes
                  if ((data as any).includeNormalizationKeys) {
                    dispatch({ type: "SET_NORMALIZATION_KEY_PREFIXES", payload: [
                      "auto.system.normalization",
                      "system.normalization"
                    ] });
                  }
                }
                if (data.schema.caseVariantLayers && typeof data.schema.caseVariantLayers === "object") {
                  dispatch({
                    type: "SET_SCHEMA",
                    payload: {
                      ...nextSchema,
                      caseVariantLayers: data.schema.caseVariantLayers
                    }
                  });
                }
                if (data.schema.normalizationKeyLayers && typeof data.schema.normalizationKeyLayers === "object") {
                  dispatch({
                    type: "SET_SCHEMA",
                    payload: {
                      ...nextSchema,
                      normalizationKeyLayers: data.schema.normalizationKeyLayers
                    }
                  });
                }
                setSchemaStatus(`Imported ${file.name}.`);
              } catch (err) {
                setSchemaStatus((err as Error).message || "Failed to import schema.");
              } finally {
                if (inputEl) {
                  inputEl.value = "";
                }
              }
            }}
          />
        </div>
        {schemaStatus && <p className="muted" style={{ marginTop: 8 }}>{schemaStatus}</p>}
      </div>
      <div className="section">
        <label className="label">Parent Group (root level)</label>
        <select
          className="select"
          value={parentGroup}
          onChange={(e) => dispatch({ type: "SET_PARENT_GROUP", payload: e.target.value })}
          disabled={groups.length === 0}
        >
          {groups
            .filter((group) => !group.fullPath.includes("/"))
            .map((group) => (
              <option key={group.id} value={group.fullPath}>
                {group.fullPath}
              </option>
            ))}
        </select>
        {groups.length === 0 && <p className="muted">Load portal groups to select a parent.</p>}
      </div>
      <div className="section">
        <label className="label">Focus Customers (comma-separated)</label>
        <input
          className="input"
          value={focusCustomers.join(", ")}
          onChange={(e) => dispatch({ type: "SET_FOCUS_CUSTOMERS", payload: parseList(e.target.value) })}
        />
        <p className="muted">Matches the first segment under the parent group.</p>
      </div>
      <div className="section">
        <label className="label">Exclude Customers (comma-separated)</label>
        <input
          className="input"
          value={excludeCustomers.join(", ")}
          onChange={(e) => dispatch({ type: "SET_EXCLUDE_CUSTOMERS", payload: parseList(e.target.value) })}
        />
        <p className="muted">Exclusions are case-insensitive.</p>
      </div>
      <div className="section">
        <label className="label">Leaf Group Type</label>
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={schemaStatic}
            onChange={(e) => {
              const next = e.target.checked;
              dispatch({ type: "SET_SCHEMA_STATIC", payload: next });
              if (next) {
                setShowAdvanced(false);
              }
            }}
          />
          <span>Make leaf groups static (no appliesTo)</span>
        </label>
        <p className="muted">
          When enabled, leaf groups are created with an empty appliesTo. Dynamic rules are ignored.
        </p>
      </div>
      <div className="section">
        <label className="label">AppliesTo Case Variants</label>
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={includeCaseVariants}
            onChange={(e) =>
              dispatch({ type: "SET_INCLUDE_CASE_VARIANTS", payload: e.target.checked })
            }
            disabled={schemaStatic}
          />
          <span>Include case variants (upper/lower/title)</span>
        </label>
        <p className="muted">
          Expands values to upper/lower/title-case. Use per-layer toggles below to scope.
        </p>
      </div>
      <div className="section">
        <label className="label">AppliesTo Normalization Keys</label>
        <input
          className="input"
          value={normalizationKeyPrefixes.join(", ")}
          onChange={(e) =>
            dispatch({ type: "SET_NORMALIZATION_KEY_PREFIXES", payload: parseList(e.target.value) })
          }
          placeholder="auto.system.normalization, system.normalization"
          disabled={schemaStatic}
        />
        <p className="muted">
          Comma-separated prefixes to apply for normalization keys (e.g. `auto.system.normalization`).
        </p>
      </div>
      <div className="section">
        <label className="label">Property Pills Palette</label>
        <input
          className="input"
          placeholder="Search property names"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          maxHeight: 200,
          overflowY: "auto",
          padding: 12,
          background: "var(--bg-secondary)",
          borderRadius: 10,
          border: "1px solid var(--border)"
        }}>
          {filteredProperties.map((name) => (
            <button
              key={name}
              type="button"
              className={`pill ${paletteSelection.includes(name) ? "active" : ""}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", name);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => {
                setPaletteSelection((prev) =>
                  prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
                );
              }}
            >
              {name}
            </button>
          ))}
          {filteredProperties.length === 0 && (
            <div style={{
              width: "100%",
              padding: 20,
              textAlign: "center",
              color: "var(--muted)"
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 500 }}>No properties loaded yet</div>
              <div style={{ fontSize: 12, marginTop: 4, color: "var(--ink-tertiary)" }}>Load devices from the portal to see available properties</div>
            </div>
          )}
        </div>
        {schema.layers.length > 0 && (
          <div className="section">
            <label className="label">Added Pills</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {schema.layers.flatMap((layer) => layer.parts).map((pill) => (
                <span key={pill.id} className="pill active">
                  {pill.key}
                </span>
              ))}
              {schema.layers.flatMap((layer) => layer.parts).length === 0 && (
                <span className="muted">No pills added yet.</span>
              )}
            </div>
          </div>
        )}
        {paletteSelection.length > 0 && (
          <div className="section">
            <label className="label">Selected Pills Order</label>
            <div className="actions" style={{ flexDirection: "column", alignItems: "flex-start" }}>
              {paletteSelection.map((name) => (
                <div key={name} className="pill active">
                  <strong>{name}</strong>
                  <button className="button secondary" type="button" onClick={() => moveSelected(name, "up")}>
                    ↑
                  </button>
                  <button className="button secondary" type="button" onClick={() => moveSelected(name, "down")}>
                    ↓
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setPaletteSelection((prev) => prev.filter((item) => item !== name))}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="actions" style={{ marginTop: 8 }}>
          <button
            className="button secondary"
            type="button"
            disabled={paletteSelection.length === 0}
            onClick={() => {
              if (paletteSelection.length === 0) {
                return;
              }
              const newLayers = paletteSelection.map((name) => ({
                id: Math.random().toString(36).slice(2, 9),
                parts: [createPill(name)]
              }));
              const separators = Array.from({ length: Math.max(newLayers.length - 1, 0) }, () => "AND" as const);
              const mergedLayers = newLayers;
              const mergedSeparators = Array.from(
                { length: Math.max(mergedLayers.length - 1, 0) },
                () => "AND" as const
              );
              dispatch({
                type: "SET_SCHEMA",
                payload: {
                  ...schema,
                  layers: mergedLayers,
                  layerSeparators: mergedSeparators
                }
              });
              setSelectedLayer(schema.layers.length);
            }}
          >
            Build Layers From Selection
          </button>
          <p className="muted">Select pills, then build layers in that order.</p>
        </div>
      </div>

      <div className="section">
        <button
          className="button secondary"
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          disabled={schemaStatic}
          style={{
            width: "100%",
            justifyContent: "center",
            gap: 8
          }}
        >
          {showAdvanced ? "▲ Hide" : "▼ Show"} Advanced Layer Configuration
        </button>
        {schemaStatic && (
          <p className="muted" style={{ marginTop: 8 }}>
            Advanced layer configuration is hidden while leaf groups are static.
          </p>
        )}
      </div>
      {showAdvanced && !schemaStatic && (
        <div className="section">
          <h3 style={{ margin: "12px 0" }}>Schema Layers</h3>
          <div className="notice info" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <span style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  background: "rgba(59, 130, 246, 0.2)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  marginRight: 6,
                  color: "#60a5fa"
                }}>STRICT</span>
                <span style={{ fontSize: 12 }}>Exact match (==)</span>
              </div>
              <div>
                <span style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  background: "rgba(59, 130, 246, 0.2)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  marginRight: 6,
                  color: "#60a5fa"
                }}>EQ</span>
                <span style={{ fontSize: 12 }}>Same as strict</span>
              </div>
              <div>
                <span style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  background: "rgba(59, 130, 246, 0.2)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  marginRight: 6,
                  color: "#60a5fa"
                }}>COPY-FIRST</span>
                <span style={{ fontSize: 12 }}>Use first key&apos;s value</span>
              </div>
            </div>
            <div style={{
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.2)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              wordBreak: "break-all"
            }}>
              <span style={{ color: "var(--muted)", marginRight: 8 }}>Example:</span>
              <span style={{ color: "#60a5fa" }}>{exampleAppliesTo}</span>
            </div>
          </div>
          {schema.layers.map((layer, index) => (
            <div key={layer.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={includeCaseVariants && (schema.caseVariantLayers?.[layer.id] ?? true)}
                    onChange={(e) => toggleCaseVariantLayer(layer.id, e.target.checked)}
                    disabled={!includeCaseVariants || schemaStatic}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>
                    Apply case variants to this layer
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={normalizationKeyPrefixes.length > 0 && (schema.normalizationKeyLayers?.[layer.id] ?? true)}
                    onChange={(e) => toggleNormalizationLayer(layer.id, e.target.checked)}
                    disabled={normalizationKeyPrefixes.length === 0 || schemaStatic}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-tertiary)" }}>
                    Apply normalization keys to this layer
                  </span>
                </label>
              </div>
            <LayerDropZone
              layer={layer}
              index={index}
              onRemoveLayer={() => dispatch({ type: "REMOVE_LAYER", payload: index })}
              onSelect={() => setSelectedLayer(index)}
              isSelected={selectedLayer === index}
              onPillAdded={() => {
                setSearch("");
                setPaletteSelection([]);
              }}
              onMoveUp={() => {
                if (index === 0) {
                  return;
                }
                  const nextLayers = [...schema.layers];
                  const [moved] = nextLayers.splice(index, 1);
                  nextLayers.splice(index - 1, 0, moved);
                  dispatch({
                    type: "SET_SCHEMA",
                    payload: {
                      ...schema,
                      layers: nextLayers
                    }
                  });
                }}
                onMoveDown={() => {
                  if (index >= schema.layers.length - 1) {
                    return;
                  }
                  const nextLayers = [...schema.layers];
                  const [moved] = nextLayers.splice(index, 1);
                  nextLayers.splice(index + 1, 0, moved);
                  dispatch({
                    type: "SET_SCHEMA",
                    payload: {
                      ...schema,
                      layers: nextLayers
                    }
                  });
                }}
              />
              {index < schema.layers.length - 1 && (
                <div style={{ margin: "8px 0" }}>
                  <label className="label">Layer Separator</label>
                  <select
                    className="select"
                    value={schema.layerSeparators[index]}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_LAYER_SEPARATOR",
                        payload: { index, value: e.target.value as "AND" | "OR" }
                      })
                    }
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </div>
              )}
              <StaticLiteralsEditor layerIndex={index} />
            </div>
          ))}
          <button className="button secondary" onClick={() => dispatch({ type: "ADD_LAYER" })} type="button">
            Add Layer
          </button>
        </div>
      )}
      <div className="section">
        <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>Example appliesTo</strong>
          <button
            className="button secondary"
            type="button"
            onClick={() => setExampleNonce((prev) => prev + 1)}
          >
            Refresh Example
          </button>
        </div>
        <div style={{
          marginTop: 8,
          padding: "10px 12px",
          background: "rgba(0, 0, 0, 0.2)",
          borderRadius: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          wordBreak: "break-all"
        }}>
          <span style={{ color: "var(--muted)", marginRight: 8 }}>Example:</span>
          <span style={{ color: "#60a5fa" }}>{exampleAppliesTo}</span>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          This preview updates with your schema settings and case-variant options.
        </p>
      </div>
    </div>
  );
}
