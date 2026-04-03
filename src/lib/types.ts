export type LMCreds = {
  accessId: string;
  accessKey: string;
  portal: string;
};

export type LMDevice = {
  id: number;
  displayName: string;
  customProperties: LMProperty[];
  systemProperties: LMProperty[];
  autoProperties: LMProperty[];
};

export type LMProperty = {
  name: string;
  value: string;
};

export type LMGroup = {
  id: number;
  fullPath: string;
  name: string;
  appliesTo: string;
  numOfHosts: number;
  parentId: number;
  isDynamic?: boolean;
};

export type SchemaPill = {
  id: string;
  key: string;
  strict: boolean;
  mode: "regex" | "eq";
  connectorToNext?: "AND" | "OR";
  copyFromFirst?: boolean;
};

export type SchemaLayer = {
  id: string;
  parts: SchemaPill[];
};

export type SchemaDefinition = {
  layers: SchemaLayer[];
  layerSeparators: ("AND" | "OR")[];
  staticLayerLiterals: Record<number, StaticLiteral[]>;
  caseVariantLayers?: Record<string, boolean>;
  normalizationKeyLayers?: Record<string, boolean>;
};

export type StaticLiteral = {
  key: string;
  value: string;
  strict: boolean;
};

export type GeneratedGroup = {
  fullPath: string;
  appliesTo: string;
  conflict?: boolean;
};

export type ConflictDetail = {
  path: string;
  variants: Array<{ appliesTo: string; count: number }>;
};

export type DiffRow = {
  id?: number;
  existsInPortal: boolean;
  fullPath: string;
  current_applies_to: string;
  new_applies_to: string;
  numOfHosts?: number;
  isDynamic?: boolean;
  selected?: boolean;
  action?: "create" | "update" | "match" | "static";
};

export type DiffBuckets = {
  missing: DiffRow[];
  needsUpdate: DiffRow[];
  matches: DiffRow[];
  staticInPortal: DiffRow[];
};

export type TreeNode = {
  name: string;
  fullPath: string;
  children: TreeNode[];
  generatedCount: number;
  portalCount: number;
};
