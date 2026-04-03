"use client";

import { useState } from "react";
import { useAppDispatch, useAppState } from "../store/appStore";
import type { LMGroup, LMDevice } from "../lib/types";

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

interface CredentialsFormProps {
  embedded?: boolean;
}

export function CredentialsForm({ embedded = false }: CredentialsFormProps) {
  const { creds } = useAppState();
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [includeAuto, setIncludeAuto] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    setStatus("Testing connection...");
    try {
      await postJSON("/api/lm/test", creds);
      setStatus("Connection OK.");
    } catch (err) {
      setStatus(`Test failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async () => {
    setLoading(true);
    setStatus("Loading portal data...");
    try {
      const [groups, devices] = await Promise.all([
        postJSON<LMGroup[]>("/api/lm/groups", creds),
        postJSON<LMDevice[]>("/api/lm/devices", { ...creds, filter: deviceFilter || undefined })
      ]);
      dispatch({ type: "SET_GROUPS", payload: groups });
      dispatch({ type: "SET_DEVICES", payload: devices });
      const propertySet = new Set<string>();
      devices.forEach((device: any) => {
        const props = [
          ...(device.customProperties || []),
          ...(includeSystem ? device.systemProperties || [] : []),
          ...(includeAuto ? device.autoProperties || [] : [])
        ];
        props.forEach((prop: any) => {
          if (prop?.name) {
            propertySet.add(prop.name);
          }
        });
      });
      dispatch({ type: "SET_PROPERTY_NAMES", payload: Array.from(propertySet).sort() });
      setStatus(`Loaded ${devices.length} devices and ${groups.length} groups.`);
    } catch (err) {
      setStatus(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status.includes("OK") || status.includes("Loaded");
  const isError = status.includes("failed");

  return (
    <div className={embedded ? "credentials-form-embedded" : "panel section"}>
      <h3 style={{ margin: "0 0 var(--space-5)", fontSize: 16 }}>Portal Connection</h3>

      <div style={{ display: "grid", gap: 16 }}>
        <div className="section" style={{ marginBottom: 0 }}>
          <label className="label">Portal URL</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              value={creds.portal}
              onChange={(e) =>
                dispatch({ type: "SET_CREDS", payload: { ...creds, portal: e.target.value.trim() } })
              }
              placeholder="your-company.logicmonitor.com"
              style={{ paddingLeft: 36 }}
            />
            <span style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              opacity: 0.5
            }}>🌐</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="section" style={{ marginBottom: 0 }}>
            <label className="label">Access ID</label>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                value={creds.accessId}
                onChange={(e) =>
                  dispatch({ type: "SET_CREDS", payload: { ...creds, accessId: e.target.value } })
                }
                placeholder="Your access ID"
                style={{ paddingLeft: 36 }}
              />
              <span style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                opacity: 0.5
              }}>🔑</span>
            </div>
          </div>
          <div className="section" style={{ marginBottom: 0 }}>
            <label className="label">Access Key</label>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                type="password"
                value={creds.accessKey}
                onChange={(e) =>
                  dispatch({ type: "SET_CREDS", payload: { ...creds, accessKey: e.target.value } })
                }
                placeholder="••••••••"
                style={{ paddingLeft: 36 }}
              />
              <span style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                opacity: 0.5
              }}>🔒</span>
            </div>
          </div>
        </div>

        <div className="section" style={{ marginBottom: 0 }}>
          <label className="label">Device Filter (optional)</label>
          <textarea
            className="textarea"
            rows={2}
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            placeholder='Example: systemProperties.name:"system.cloud.category",systemProperties.value:"AWS/EC2"'
            style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>
            Leave empty to use defaults: AWS/EC2 category and deviceType:0
          </p>
        </div>

        <div className="section" style={{ marginBottom: 0 }}>
          <label className="label">Property Sources</label>
          <div style={{
            display: "flex",
            gap: 16,
            padding: "10px 14px",
            background: "var(--bg-secondary)",
            borderRadius: 8,
            border: "1px solid var(--border)"
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
              color: includeSystem ? "#10b981" : "#6b7280",
              fontWeight: includeSystem ? 500 : 400
            }}>
              <input
                type="checkbox"
                checked={includeSystem}
                onChange={(e) => setIncludeSystem(e.target.checked)}
              />
              System Properties
            </label>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
              color: includeAuto ? "#10b981" : "#6b7280",
              fontWeight: includeAuto ? 500 : 400
            }}>
              <input
                type="checkbox"
                checked={includeAuto}
                onChange={(e) => setIncludeAuto(e.target.checked)}
              />
              Auto Properties
            </label>
          </div>
        </div>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="button secondary" onClick={handleTest} disabled={loading}>
          {loading ? <span className="loading" /> : "🔌"} Test Connection
        </button>
        <button className="button" onClick={handleLoad} disabled={loading}>
          {loading ? <span className="loading" /> : "⬇️"} Load From Portal
        </button>
      </div>

      {status && (
        <div
          className={`notice ${isConnected ? "success" : isError ? "error" : ""}`}
          style={{ marginTop: 16 }}
        >
          {isConnected && "✓ "}
          {isError && "✕ "}
          {status}
        </div>
      )}
    </div>
  );
}
