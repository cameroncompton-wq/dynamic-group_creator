"use client";

import { useState } from "react";
import { useAppState, useAppDispatch } from "../store/appStore";
import { CredentialsForm } from "./CredentialsForm";

type DataSourceMode = "portal" | "csv" | "snapshot" | null;

interface DataSourceTabProps {
  onComplete: () => void;
}

export function DataSourceTab({ onComplete }: DataSourceTabProps) {
  const { devices, groups, schema } = useAppState();
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<DataSourceMode>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const hasData = devices.length > 0;

  const handleCSVUpload = async (file: File) => {
    setCsvLoading(true);
    setCsvError(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error("CSV file must have a header row and at least one data row");
      }

      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

      // Check for required columns
      const requiredColumns = ["displayname"];
      const missingColumns = requiredColumns.filter(
        (col) => !header.includes(col)
      );
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
      }

      const displayNameIdx = header.indexOf("displayname");

      // Parse rows into devices
      const devices = lines.slice(1).map((line, idx) => {
        const values = parseCSVLine(line);
        const customProperties: { name: string; value: string }[] = [];

        // All columns except displayName become custom properties
        header.forEach((col, colIdx) => {
          if (col !== "displayname" && values[colIdx]) {
            customProperties.push({
              name: col,
              value: values[colIdx],
            });
          }
        });

        return {
          id: idx + 1,
          displayName: values[displayNameIdx] || `Device ${idx + 1}`,
          customProperties,
          systemProperties: [],
          autoProperties: [],
        };
      });

      // Extract unique property names
      const propertyNames = new Set<string>();
      devices.forEach((device) => {
        device.customProperties.forEach((prop) => {
          propertyNames.add(prop.name);
        });
      });

      dispatch({ type: "SET_DEVICES", payload: devices });
      dispatch({ type: "SET_PROPERTY_NAMES", payload: Array.from(propertyNames) });
      dispatch({ type: "SET_GROUPS", payload: [] }); // No portal groups in CSV mode

      setCsvFile(file);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Failed to parse CSV");
    } finally {
      setCsvLoading(false);
    }
  };

  const collectPropertyNames = (devices: Array<{ customProperties?: any[]; systemProperties?: any[]; autoProperties?: any[] }>) => {
    const propertyNames = new Set<string>();
    devices.forEach((device) => {
      const props = [
        ...(device.customProperties || []),
        ...(device.systemProperties || []),
        ...(device.autoProperties || [])
      ];
      props.forEach((prop: any) => {
        if (prop?.name) {
          propertyNames.add(prop.name);
        }
      });
    });
    return Array.from(propertyNames).sort();
  };

  const handleSnapshotUpload = async (file: File) => {
    setSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        devices?: any[];
        groups?: any[];
        propertyNames?: string[];
      };
      if (!Array.isArray(data.devices) || data.devices.length === 0) {
        throw new Error("Snapshot must include a devices array.");
      }
      const devices = data.devices as any[];
      const groups = Array.isArray(data.groups) ? data.groups : [];
      const propertyNames = Array.isArray(data.propertyNames)
        ? data.propertyNames
        : collectPropertyNames(devices);

      dispatch({ type: "SET_DEVICES", payload: devices });
      dispatch({ type: "SET_GROUPS", payload: groups });
      dispatch({ type: "SET_PROPERTY_NAMES", payload: propertyNames });
      setSnapshotFile(file);
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : "Failed to import snapshot");
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleExportSnapshot = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      devices,
      groups,
      propertyNames: collectPropertyNames(devices)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lm-data-snapshot.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  // Simple CSV line parser that handles quoted values
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const buildExampleCSV = () => {
    return [
      "displayName,customer,location,type",
      "server-01,Acme Inc,US-East,Windows",
      "server-02,Acme Inc,US-West,Linux",
      "router-01,Beta Corp,EU-West,Network"
    ].join("\n");
  };

  const handleDownloadExample = () => {
    const csv = buildExampleCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lm-example-devices.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePortalSuccess = () => {
    // Portal credentials form handles its own state
    // This is called when devices are loaded successfully
  };

  // If we already have data, show a summary with option to change
  if (hasData && mode !== null) {
    return (
      <div className="panel data-source-tab">
        <h2>Data Source</h2>

        <div className="data-source-summary">
          <div className="summary-card success">
            <div className="summary-icon">✓</div>
            <div className="summary-content">
              <h3>Data Loaded</h3>
              <p>
                <strong>{devices.length}</strong> devices loaded
                {groups.length > 0 && (
                  <>, <strong>{groups.length}</strong> portal groups</>
                )}
              </p>
              <p className="summary-source">
                Source: {mode === "portal"
                  ? "LogicMonitor Portal"
                  : mode === "snapshot"
                  ? snapshotFile?.name || "Snapshot File"
                  : csvFile?.name || "CSV File"}
              </p>
            </div>
          </div>

          <div className="summary-actions">
            <button
              className="button"
              onClick={onComplete}
            >
              Continue to Schema Builder
            </button>
            <button
              className="button secondary"
              onClick={handleExportSnapshot}
            >
              Export Snapshot
            </button>
            <button
              className="button secondary"
              onClick={() => {
                dispatch({ type: "SET_DEVICES", payload: [] });
                dispatch({ type: "SET_GROUPS", payload: [] });
                dispatch({ type: "SET_PROPERTY_NAMES", payload: [] });
                setMode(null);
                setCsvFile(null);
                setSnapshotFile(null);
              }}
            >
              Change Data Source
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel data-source-tab">
      <h2>Data Source</h2>
      <p className="section-description">
        Choose how to load your device data. You can connect directly to LogicMonitor
        or import device information from a CSV file.
      </p>

      {mode === null ? (
        <>
          <div className="data-source-options">
            <button
              className="data-source-option"
              onClick={() => setMode("portal")}
            >
              <div className="option-icon">🔌</div>
              <div className="option-content">
                <h3>Connect to Portal</h3>
                <p>
                  Connect directly to your LogicMonitor portal to load devices
                  and existing groups. Changes can be applied back to the portal.
                </p>
              </div>
              <span className="option-arrow">→</span>
            </button>

            <button
              className="data-source-option"
              onClick={() => setMode("csv")}
            >
              <div className="option-icon">📄</div>
              <div className="option-content">
                <h3>Import from CSV</h3>
                <p>
                  Upload a CSV file with device data. Use this for testing or when
                  portal access is not available.
                </p>
              </div>
              <span className="option-arrow">→</span>
            </button>

            <button
              className="data-source-option"
              onClick={() => setMode("snapshot")}
            >
              <div className="option-icon">💾</div>
              <div className="option-content">
                <h3>Import Snapshot</h3>
                <p>
                  Load previously exported device + group data without calling the API.
                </p>
              </div>
              <span className="option-arrow">→</span>
            </button>
          </div>

          <div className="csv-format-help" style={{ marginTop: 16 }}>
            <h4>Expected CSV Format</h4>
            <pre>
{`displayName,customer,location,type
server-01,Acme Inc,US-East,Windows
server-02,Acme Inc,US-West,Linux
router-01,Beta Corp,EU-West,Network`}
            </pre>
            <button className="button secondary" type="button" onClick={handleDownloadExample}>
              Download Example CSV
            </button>
          </div>
        </>
      ) : mode === "portal" ? (
        <div className="data-source-form">
          <button
            className="back-button"
            onClick={() => setMode(null)}
            type="button"
          >
            ← Back to options
          </button>
          <CredentialsForm embedded />
          {devices.length > 0 && (
            <div className="form-actions">
              <button className="button" onClick={onComplete}>
                Continue to Schema Builder
              </button>
            </div>
          )}
        </div>
      ) : mode === "snapshot" ? (
        <div className="data-source-form">
          <button
            className="back-button"
            onClick={() => setMode(null)}
            type="button"
          >
            ← Back to options
          </button>

          <div className="csv-upload-section">
            <h3>Import Snapshot</h3>
            <p className="muted">
              Upload a JSON snapshot exported from this tool to avoid reloading devices from the portal.
            </p>

            <div className="csv-upload-area">
              <input
                type="file"
                accept=".json,application/json"
                id="snapshot-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleSnapshotUpload(file);
                  }
                }}
                style={{ display: "none" }}
              />
              <label htmlFor="snapshot-upload" className="csv-upload-label">
                <span className="upload-icon">📁</span>
                <span className="upload-text">
                  {snapshotLoading
                    ? "Processing..."
                    : snapshotFile
                    ? snapshotFile.name
                    : "Click to select JSON snapshot"}
                </span>
              </label>
            </div>

            {snapshotError && (
              <div className="notice error">
                {snapshotError}
              </div>
            )}
          </div>

          {devices.length > 0 && (
            <div className="form-actions">
              <button className="button" onClick={onComplete}>
                Continue to Schema Builder
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="data-source-form">
          <button
            className="back-button"
            onClick={() => setMode(null)}
            type="button"
          >
            ← Back to options
          </button>

          <div className="csv-upload-section">
            <h3>Import CSV File</h3>
            <p className="muted">
              Upload a CSV file with device information. The file must have a header row
              with at least a <code>displayName</code> column. All other columns will be
              treated as device properties.
            </p>

            <div className="csv-upload-area">
              <input
                type="file"
                accept=".csv"
                id="csv-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleCSVUpload(file);
                  }
                }}
                style={{ display: "none" }}
              />
              <label htmlFor="csv-upload" className="csv-upload-label">
                <span className="upload-icon">📁</span>
                <span className="upload-text">
                  {csvLoading
                    ? "Processing..."
                    : csvFile
                    ? csvFile.name
                    : "Click to select CSV file"}
                </span>
              </label>
            </div>

            {csvError && (
              <div className="notice error">
                {csvError}
              </div>
            )}

            <div className="csv-format-help">
              <h4>Expected CSV Format</h4>
              <pre>
{`displayName,customer,location,type
server-01,Acme Inc,US-East,Windows
server-02,Acme Inc,US-West,Linux
router-01,Beta Corp,EU-West,Network`}
              </pre>
              <button className="button secondary" type="button" onClick={handleDownloadExample}>
                Download Example CSV
              </button>
            </div>
          </div>

          {devices.length > 0 && (
            <div className="form-actions">
              <button className="button" onClick={onComplete}>
                Continue to Schema Builder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
