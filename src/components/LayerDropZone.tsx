"use client";

import { useState } from "react";
import { useAppDispatch, useAppState, createPill } from "../store/appStore";
import type { SchemaLayer, SchemaPill } from "../lib/types";
import { PropertyPill } from "./PropertyPill";

export function LayerDropZone({
  layer,
  index,
  onRemoveLayer,
  onSelect,
  isSelected,
  onPillAdded,
  onMoveUp,
  onMoveDown
}: {
  layer: SchemaLayer;
  index: number;
  onRemoveLayer: () => void;
  onSelect: () => void;
  isSelected: boolean;
  onPillAdded: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const dispatch = useAppDispatch();
  const [isDragOver, setIsDragOver] = useState(false);

  const updatePill = (pill: SchemaPill) => {
    dispatch({
      type: "UPDATE_LAYER",
      payload: {
        index,
        layer: { ...layer, parts: layer.parts.map((p) => (p.id === pill.id ? pill : p)) }
      }
    });
  };

  const removePill = (pillId: string) => {
    dispatch({
      type: "UPDATE_LAYER",
      payload: { index, layer: { ...layer, parts: layer.parts.filter((p) => p.id !== pillId) } }
    });
  };

  const movePill = (pillId: string, direction: "up" | "down") => {
    const currentIndex = layer.parts.findIndex((p) => p.id === pillId);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= layer.parts.length) {
      return;
    }
    const reordered = [...layer.parts];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    dispatch({ type: "UPDATE_LAYER", payload: { index, layer: { ...layer, parts: reordered } } });
  };

  const addPill = (key: string) => {
    const pill = createPill(key);
    dispatch({
      type: "UPDATE_LAYER",
      payload: { index, layer: { ...layer, parts: [...layer.parts, pill] } }
    });
  };

  return (
    <div
      className={`layer ${isSelected ? "selected" : ""} ${isDragOver ? "drag-over" : ""}`}
      onClick={onSelect}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const key = event.dataTransfer.getData("text/plain");
        if (!key) {
          return;
        }
        const pill = createPill(key);
        dispatch({
          type: "UPDATE_LAYER",
          payload: { index, layer: { ...layer, parts: [...layer.parts, pill] } }
        });
        onPillAdded();
      }}
    >
      <div className="layer-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="layer-number">{index + 1}</span>
          <span>Layer {index + 1}</span>
        </div>
        <div className="actions">
          <button
            className="button secondary"
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            style={{ padding: "4px 8px", fontSize: 12 }}
            title="Move layer up"
          >
            ↑
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            style={{ padding: "4px 8px", fontSize: 12 }}
            title="Move layer down"
          >
            ↓
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveLayer(); }}
            style={{ padding: "4px 8px", fontSize: 12, color: "#f87171" }}
            title="Remove layer"
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layer.parts.length === 0 && (
          <div style={{
            padding: 16,
            textAlign: "center",
            color: "var(--muted)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: 8,
            background: "var(--bg-tertiary)"
          }}>
            Drag properties here or type below
          </div>
        )}
        {layer.parts.map((pill) => (
          <PropertyPill
            key={pill.id}
            pill={pill}
            onChange={updatePill}
            onRemove={() => removePill(pill.id)}
            onMoveUp={() => movePill(pill.id, "up")}
            onMoveDown={() => movePill(pill.id, "down")}
          />
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <input
          className="input"
          placeholder="Type property name and press Enter..."
          style={{ fontSize: 13 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const target = e.target as HTMLInputElement;
              if (target.value) {
                addPill(target.value);
                target.value = "";
              }
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
