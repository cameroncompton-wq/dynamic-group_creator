"use client";

import { useState } from "react";
import { useAppDispatch, useAppState } from "../store/appStore";
import { parseCSV, exportCSV } from "../lib/csv";
import { mergeCSVRows } from "../lib/diff";
import type { DiffBuckets, DiffRow } from "../lib/types";

const bucketRows = (rows: DiffRow[]): DiffBuckets => {
  const missing: DiffRow[] = [];
  const needsUpdate: DiffRow[] = [];
  const matches: DiffRow[] = [];
  const staticInPortal: DiffRow[] = [];

  rows.forEach((row) => {
    if (row.action) {
      if (row.action === "create") {
        missing.push(row);
        return;
      }
      if (row.action === "update") {
        needsUpdate.push(row);
        return;
      }
      if (row.action === "match") {
        matches.push(row);
        return;
      }
      if (row.action === "static") {
        staticInPortal.push(row);
        return;
      }
    }

    if (!row.existsInPortal) {
      missing.push(row);
      return;
    }
    if (!row.current_applies_to) {
      staticInPortal.push(row);
      return;
    }
    if (row.current_applies_to !== row.new_applies_to) {
      needsUpdate.push(row);
      return;
    }
    matches.push(row);
  });

  return { missing, needsUpdate, matches, staticInPortal };
};

export function CSVImportExport() {
  const { diffs, groups } = useAppState();
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState("");

  const handleImport = async (file: File | null) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    const rows = parseCSV(text);
    dispatch({ type: "SET_CSV_ROWS", payload: rows });
    dispatch({ type: "SET_DIFFS", payload: bucketRows(rows) });
    setStatus(`Imported ${rows.length} rows.`);
  };

  const handleExport = () => {
    if (!diffs) {
      return;
    }
    const rows = [
      ...diffs.missing.map((row) => ({ ...row, action: "create" as const })),
      ...diffs.needsUpdate.map((row) => ({ ...row, action: "update" as const })),
      ...diffs.matches.map((row) => ({ ...row, action: "match" as const })),
      ...diffs.staticInPortal.map((row) => ({ ...row, action: "static" as const }))
    ];
    const csv = exportCSV(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lm-group-diff.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReconcile = () => {
    if (!diffs) {
      return;
    }
    const rows = mergeCSVRows(Object.values(diffs).flat(), groups);
    dispatch({ type: "SET_DIFFS", payload: bucketRows(rows) });
    setStatus("Reconciled with portal.");
  };

  return (
    <div className="panel">
      <h2>CSV Import/Export</h2>
      <div className="section">
        <div style={{
          border: "2px dashed var(--border)",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          background: "var(--bg-secondary)",
          transition: "all 0.2s ease",
          cursor: "pointer"
        }}>
          <div style={{
            width: 48,
            height: 48,
            margin: "0 auto 12px",
            background: "linear-gradient(135deg, #10b981, #059669)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 20,
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)"
          }}>
            📄
          </div>
          <label style={{ display: "block", cursor: "pointer" }}>
            <span style={{ fontWeight: 500, color: "var(--ink)", display: "block", marginBottom: 4 }}>
              Drop CSV file here or click to browse
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Supports .csv files
            </span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>
      <div className="actions">
        <button className="button secondary" type="button" onClick={handleReconcile}>
          🔄 Reconcile with Portal
        </button>
        <button className="button" type="button" onClick={handleExport}>
          ⬇️ Export CSV
        </button>
      </div>
      {status && (
        <p className="notice success" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
    </div>
  );
}
