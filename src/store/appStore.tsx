"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode
} from "react";
import type {
  DiffBuckets,
  DiffRow,
  GeneratedGroup,
  ConflictDetail,
  LMDevice,
  LMGroup,
  LMCreds,
  SchemaDefinition,
  SchemaLayer,
  SchemaPill,
  StaticLiteral,
  TreeNode
} from "../lib/types";

const makeId = () => Math.random().toString(36).slice(2, 9);

const defaultSchema: SchemaDefinition = {
  layers: [
    { id: makeId(), parts: [{ id: makeId(), key: "location", strict: false, mode: "regex" }] },
    { id: makeId(), parts: [{ id: makeId(), key: "role", strict: false, mode: "regex" }] }
  ],
  layerSeparators: ["AND"],
  staticLayerLiterals: {},
  caseVariantLayers: {},
  normalizationKeyLayers: {}
};

export type AppState = {
  creds: LMCreds;
  devices: LMDevice[];
  groups: LMGroup[];
  propertyNames: string[];
  parentGroup: string;
  focusCustomers: string[];
  excludeCustomers: string[];
  schema: SchemaDefinition;
  schemaStatic: boolean;
  includeCaseVariants: boolean;
  normalizationKeyPrefixes: string[];
  generated: GeneratedGroup[];
  tree: TreeNode | null;
  diffs: DiffBuckets | null;
  csvRows: DiffRow[];
  dryRun: boolean;
  createGroups: boolean;
  updateAppliesTo: boolean;
  conflicts: ConflictDetail[];
  selectedLeaf: string | null;
};

export type AppAction =
  | { type: "SET_CREDS"; payload: LMCreds }
  | { type: "SET_DEVICES"; payload: LMDevice[] }
  | { type: "SET_GROUPS"; payload: LMGroup[] }
  | { type: "SET_PROPERTY_NAMES"; payload: string[] }
  | { type: "SET_PARENT_GROUP"; payload: string }
  | { type: "SET_FOCUS_CUSTOMERS"; payload: string[] }
  | { type: "SET_EXCLUDE_CUSTOMERS"; payload: string[] }
  | { type: "SET_SCHEMA"; payload: SchemaDefinition }
  | { type: "SET_SCHEMA_STATIC"; payload: boolean }
  | { type: "SET_INCLUDE_CASE_VARIANTS"; payload: boolean }
  | { type: "SET_NORMALIZATION_KEY_PREFIXES"; payload: string[] }
  | { type: "UPDATE_LAYER"; payload: { index: number; layer: SchemaLayer } }
  | { type: "ADD_LAYER" }
  | { type: "REMOVE_LAYER"; payload: number }
  | { type: "SET_LAYER_SEPARATOR"; payload: { index: number; value: "AND" | "OR" } }
  | { type: "SET_STATIC_LITERALS"; payload: { index: number; literals: StaticLiteral[] } }
  | { type: "SET_GENERATED"; payload: { generated: GeneratedGroup[]; conflicts: ConflictDetail[] } }
  | { type: "SET_TREE"; payload: TreeNode | null }
  | { type: "SET_DIFFS"; payload: DiffBuckets | null }
  | { type: "SET_CSV_ROWS"; payload: DiffRow[] }
  | { type: "SET_DRY_RUN"; payload: boolean }
  | { type: "SET_CREATE_GROUPS"; payload: boolean }
  | { type: "SET_UPDATE_APPLIESTO"; payload: boolean }
  | { type: "UPDATE_ROW"; payload: { bucket: keyof DiffBuckets; row: DiffRow } }
  | { type: "SET_SELECTED_LEAF"; payload: string | null };

const initialState: AppState = {
  creds: {
    accessId: "",
    accessKey: "",
    portal: "nttdataincusgainwell.logicmonitor.com"
  },
  devices: [],
  groups: [],
  propertyNames: [],
  parentGroup: "Devices by Credentials",
  focusCustomers: [],
  excludeCustomers: [],
  schema: defaultSchema,
  schemaStatic: false,
  includeCaseVariants: false,
  normalizationKeyPrefixes: [],
  generated: [],
  tree: null,
  diffs: null,
  csvRows: [],
  dryRun: true,
  createGroups: true,
  updateAppliesTo: true,
  conflicts: [],
  selectedLeaf: null
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_CREDS":
      return { ...state, creds: action.payload };
    case "SET_DEVICES":
      return { ...state, devices: action.payload };
    case "SET_GROUPS":
      return { ...state, groups: action.payload };
    case "SET_PROPERTY_NAMES":
      return { ...state, propertyNames: action.payload };
    case "SET_PARENT_GROUP":
      return { ...state, parentGroup: action.payload };
    case "SET_FOCUS_CUSTOMERS":
      return { ...state, focusCustomers: action.payload };
    case "SET_EXCLUDE_CUSTOMERS":
      return { ...state, excludeCustomers: action.payload };
    case "SET_SCHEMA":
      return { ...state, schema: action.payload };
    case "SET_SCHEMA_STATIC":
      return { ...state, schemaStatic: action.payload };
    case "SET_INCLUDE_CASE_VARIANTS":
      return { ...state, includeCaseVariants: action.payload };
    case "SET_NORMALIZATION_KEY_PREFIXES":
      return { ...state, normalizationKeyPrefixes: action.payload };
    case "UPDATE_LAYER": {
      const layers = [...state.schema.layers];
      layers[action.payload.index] = action.payload.layer;
      return { ...state, schema: { ...state.schema, layers } };
    }
    case "ADD_LAYER": {
      const layers = [...state.schema.layers, { id: makeId(), parts: [] }];
      const separators: ("AND" | "OR")[] = [...state.schema.layerSeparators, "AND"];
      return { ...state, schema: { ...state.schema, layers, layerSeparators: separators } };
    }
    case "REMOVE_LAYER": {
      const layers = state.schema.layers.filter((_, i) => i !== action.payload);
      const separators = state.schema.layerSeparators.filter((_, i) => i !== action.payload - 1);
      return { ...state, schema: { ...state.schema, layers, layerSeparators: separators } };
    }
    case "SET_LAYER_SEPARATOR": {
      const separators = [...state.schema.layerSeparators];
      separators[action.payload.index] = action.payload.value;
      return { ...state, schema: { ...state.schema, layerSeparators: separators } };
    }
    case "SET_STATIC_LITERALS": {
      return {
        ...state,
        schema: {
          ...state.schema,
          staticLayerLiterals: {
            ...state.schema.staticLayerLiterals,
            [action.payload.index]: action.payload.literals
          }
        }
      };
    }
    case "SET_GENERATED":
      return { ...state, generated: action.payload.generated, conflicts: action.payload.conflicts };
    case "SET_TREE":
      return { ...state, tree: action.payload };
    case "SET_DIFFS":
      return { ...state, diffs: action.payload };
    case "SET_CSV_ROWS":
      return { ...state, csvRows: action.payload };
    case "SET_DRY_RUN":
      return { ...state, dryRun: action.payload };
    case "SET_CREATE_GROUPS":
      return { ...state, createGroups: action.payload };
    case "SET_UPDATE_APPLIESTO":
      return { ...state, updateAppliesTo: action.payload };
    case "UPDATE_ROW": {
      if (!state.diffs) {
        return state;
      }
      const list = state.diffs[action.payload.bucket].map((r) =>
        r.fullPath === action.payload.row.fullPath ? action.payload.row : r
      );
      return { ...state, diffs: { ...state.diffs, [action.payload.bucket]: list } };
    }
    case "SET_SELECTED_LEAF":
      return { ...state, selectedLeaf: action.payload };
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => state, [state]);
  return (
    <AppStateContext.Provider value={value}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStoreProvider");
  }
  return ctx;
}

export function useAppDispatch() {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) {
    throw new Error("useAppDispatch must be used within AppStoreProvider");
  }
  return ctx;
}

export const createPill = (key: string): SchemaPill => ({
  id: makeId(),
  key,
  strict: false,
  mode: "regex",
  connectorToNext: "OR"
});
