"use client";

import { useAppDispatch, useAppState } from "../store/appStore";
import type { StaticLiteral } from "../lib/types";

export function StaticLiteralsEditor({ layerIndex }: { layerIndex: number }) {
  const { schema } = useAppState();
  const dispatch = useAppDispatch();
  const literals = schema.staticLayerLiterals[layerIndex] || [];

  const updateLiteral = (idx: number, updates: Partial<StaticLiteral>) => {
    const next = literals.map((literal, i) => (i === idx ? { ...literal, ...updates } : literal));
    dispatch({ type: "SET_STATIC_LITERALS", payload: { index: layerIndex, literals: next } });
  };

  const addLiteral = () => {
    dispatch({
      type: "SET_STATIC_LITERALS",
      payload: { index: layerIndex, literals: [...literals, { key: "", value: "", strict: false }] }
    });
  };

  const removeLiteral = (idx: number) => {
    dispatch({
      type: "SET_STATIC_LITERALS",
      payload: { index: layerIndex, literals: literals.filter((_, i) => i !== idx) }
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8
      }}>
        <label style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          Static Literals
        </label>
        <button
          className="button secondary"
          type="button"
          onClick={addLiteral}
          style={{ padding: "4px 10px", fontSize: 11 }}
        >
          + Add Literal
        </button>
      </div>

      {literals.length === 0 ? (
        <div style={{
          padding: 12,
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 12,
          background: "var(--bg-tertiary)",
          borderRadius: 6,
          border: "1px dashed var(--border)"
        }}>
          No static literals defined
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {literals.map((literal, idx) => (
            <div
              key={`${layerIndex}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 10,
                background: "var(--bg-tertiary)",
                borderRadius: 8,
                border: "1px solid var(--border)"
              }}
            >
              <input
                className="input"
                placeholder="Key"
                value={literal.key}
                onChange={(e) => updateLiteral(idx, { key: e.target.value })}
                style={{ flex: 1, fontSize: 12 }}
              />
              <span style={{ color: "var(--muted)", fontSize: 14 }}>=</span>
              <input
                className="input"
                placeholder="Value"
                value={literal.value}
                onChange={(e) => updateLiteral(idx, { value: e.target.value })}
                style={{ flex: 1, fontSize: 12 }}
              />
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                color: literal.strict ? "#10b981" : "var(--muted)",
                textTransform: "uppercase",
                whiteSpace: "nowrap"
              }}>
                <input
                  type="checkbox"
                  checked={literal.strict}
                  onChange={(e) => updateLiteral(idx, { strict: e.target.checked })}
                  style={{ width: 14, height: 14 }}
                />
                strict
              </label>
              <button
                className="button secondary"
                type="button"
                onClick={() => removeLiteral(idx)}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  color: "#f87171",
                  borderColor: "rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.12)"
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
