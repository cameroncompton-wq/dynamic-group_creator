"use client";

import { useState, useRef } from "react";
import { TabNavigation, type TabId } from "../components/TabNavigation";
import { DataSourceTab } from "../components/DataSourceTab";
import { SchemaBuilder } from "../components/SchemaBuilder";
import { TreePreview, type TreePreviewHandle } from "../components/TreePreview";
import { DiffTables } from "../components/DiffTables";
import { ConsolidationTab } from "../components/ConsolidationTab";
import { useAppState } from "../store/appStore";

export default function Home() {
  const { devices, diffs, creds } = useAppState();
  const [activeTab, setActiveTab] = useState<TabId>("data-source");
  const treePreviewRef = useRef<TreePreviewHandle>(null);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
  };

  const handleDataSourceComplete = () => {
    setActiveTab("schema");
  };

  const handleSchemaComplete = () => {
    setActiveTab("preview");
    // Auto-generate tree when navigating to preview
    setTimeout(() => {
      treePreviewRef.current?.generate();
    }, 100);
  };

  return (
    <main className="app-main">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Dynamic Group Creator</h1>
          <p className="app-subtitle">LogicMonitor Device Group Generator</p>
        </div>
        <div className="header-right">
          {creds.portal && (
            <div className="portal-indicator">
              <span className="portal-icon">🔌</span>
              <span className="portal-name">{creds.portal}</span>
            </div>
          )}
          <div className="status-indicator">
            <span className="status-dot" />
            <span className="status-text">
              {devices.length > 0 ? `${devices.length} devices` : "Ready"}
            </span>
          </div>
        </div>
      </header>

      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="tab-content">
        {activeTab === "data-source" && (
          <DataSourceTab onComplete={handleDataSourceComplete} />
        )}

        {activeTab === "schema" && (
          <div className="schema-tab">
            <SchemaBuilder />
            {devices.length > 0 && (
              <div className="tab-actions">
                <button
                  className="button"
                  onClick={handleSchemaComplete}
                >
                  Continue to Preview
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "preview" && (
          <div className="preview-tab">
            <TreePreview ref={treePreviewRef} />
            {diffs && (
              <div className="tab-actions">
                <button
                  className="button"
                  onClick={() => setActiveTab("updates")}
                >
                  Continue to Updates
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "updates" && (
          <div className="diff-tab">
            <DiffTables />
          </div>
        )}

        {activeTab === "consolidation" && (
          <div className="diff-tab">
            <ConsolidationTab />
          </div>
        )}
      </div>
    </main>
  );
}
