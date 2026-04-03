"use client";

import { useAppState } from "../store/appStore";

export type TabId = "data-source" | "schema" | "preview" | "updates" | "consolidation";

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  isEnabled: (state: ReturnType<typeof useAppState>) => boolean;
  tooltip: (state: ReturnType<typeof useAppState>) => string;
}

const TABS: TabConfig[] = [
  {
    id: "data-source",
    label: "Data Source",
    icon: "1",
    isEnabled: () => true,
    tooltip: () => "Connect to portal or import CSV",
  },
  {
    id: "schema",
    label: "Schema Builder",
    icon: "2",
    isEnabled: (state) => state.devices.length > 0,
    tooltip: (state) =>
      state.devices.length > 0
        ? "Configure your group hierarchy"
        : "Load devices first to enable",
  },
  {
    id: "preview",
    label: "Preview",
    icon: "3",
    isEnabled: (state) => state.devices.length > 0 && state.schema.layers.length > 0,
    tooltip: (state) => {
      if (state.devices.length === 0) return "Load devices first";
      if (state.schema.layers.length === 0) return "Configure schema first";
      return "Generate and preview your tree";
    },
  },
  {
    id: "updates",
    label: "Updates",
    icon: "4",
    isEnabled: (state) => state.diffs !== null,
    tooltip: (state) =>
      state.diffs !== null
        ? "Review and apply changes"
        : "Generate tree first to see updates",
  },
  {
    id: "consolidation",
    label: "Property Consolidation",
    icon: "🧹",
    isEnabled: (state) => state.devices.length > 0,
    tooltip: (state) =>
      state.devices.length > 0
        ? "Find property casing conflicts"
        : "Load devices first",
  },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const state = useAppState();
  const mainTabs = TABS.filter((tab) => tab.id !== "consolidation");
  const consolidationTab = TABS.find((tab) => tab.id === "consolidation");

  return (
    <nav className="tab-navigation">
      {mainTabs.map((tab, index) => {
        const enabled = tab.isEnabled(state);
        const tooltip = tab.tooltip(state);
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            className={`tab-button ${isActive ? "active" : ""} ${!enabled ? "disabled" : ""}`}
            onClick={() => enabled && onTabChange(tab.id)}
            disabled={!enabled}
            title={tooltip}
            type="button"
          >
            <span className="tab-number">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {index < mainTabs.length - 1 && <span className="tab-connector" />}
          </button>
        );
      })}
      <div className="tab-spacer" />
      {consolidationTab && (() => {
        const enabled = consolidationTab.isEnabled(state);
        const tooltip = consolidationTab.tooltip(state);
        const isActive = activeTab === consolidationTab.id;
        return (
          <div className="tab-group-right">
            <button
              key={consolidationTab.id}
              className={`tab-button ${isActive ? "active" : ""} ${!enabled ? "disabled" : ""}`}
              onClick={() => enabled && onTabChange(consolidationTab.id)}
              disabled={!enabled}
              title={tooltip}
              type="button"
            >
              <span className="tab-number">{consolidationTab.icon}</span>
              <span className="tab-label">{consolidationTab.label}</span>
            </button>
          </div>
        );
      })()}
    </nav>
  );
}
