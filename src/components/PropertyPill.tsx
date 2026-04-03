"use client";

import type { SchemaPill } from "../lib/types";

export function PropertyPill({
  pill,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  pill: SchemaPill;
  onChange: (pill: SchemaPill) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        border: "1.5px solid var(--border)",
        background: "var(--bg-tertiary)",
        fontSize: 13,
        transition: "all 0.15s ease",
        boxShadow: "var(--shadow-sm)"
      }}
    >
      <span
        style={{
          fontWeight: 600,
          color: "#10b981",
          background: "rgba(16, 185, 129, 0.15)",
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: 12
        }}
      >
        {pill.key}
      </span>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginLeft: 4 }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            color: pill.strict ? "#10b981" : "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}
        >
          <input
            type="checkbox"
            checked={pill.strict}
            onChange={(e) => onChange({ ...pill, strict: e.target.checked })}
            style={{ width: 14, height: 14 }}
          />
          strict
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            color: pill.mode === "eq" ? "#10b981" : "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}
        >
          <input
            type="checkbox"
            checked={pill.mode === "eq"}
            onChange={(e) => onChange({ ...pill, mode: e.target.checked ? "eq" : "regex" })}
            style={{ width: 14, height: 14 }}
          />
          eq
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            color: (pill.copyFromFirst ?? false) ? "#10b981" : "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}
        >
          <input
            type="checkbox"
            checked={pill.copyFromFirst ?? false}
            onChange={(e) => onChange({ ...pill, copyFromFirst: e.target.checked })}
            style={{ width: 14, height: 14 }}
          />
          copy-first
        </label>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <select
          value={pill.connectorToNext || "OR"}
          onChange={(e) => onChange({ ...pill, connectorToNext: e.target.value as "AND" | "OR" })}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1.5px solid var(--border)",
            fontSize: 11,
            fontWeight: 600,
            background: pill.connectorToNext === "AND" ? "rgba(59, 130, 246, 0.15)" : "rgba(245, 158, 11, 0.15)",
            color: pill.connectorToNext === "AND" ? "#60a5fa" : "#fbbf24",
            cursor: "pointer"
          }}
        >
          <option value="OR">OR</option>
          <option value="AND">AND</option>
        </select>

        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={onMoveUp}
            type="button"
            style={{
              padding: "4px 6px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-secondary)",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--muted)",
              transition: "all 0.15s ease"
            }}
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            type="button"
            style={{
              padding: "4px 6px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-secondary)",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--muted)",
              transition: "all 0.15s ease"
            }}
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            type="button"
            style={{
              padding: "4px 6px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 4,
              background: "rgba(239, 68, 68, 0.12)",
              cursor: "pointer",
              fontSize: 12,
              color: "#f87171",
              transition: "all 0.15s ease"
            }}
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
