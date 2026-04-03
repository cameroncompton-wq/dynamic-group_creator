import type {
  GeneratedGroup,
  LMDevice,
  SchemaDefinition,
  SchemaLayer,
  SchemaPill,
  StaticLiteral,
  TreeNode
} from "./types";

export type GenerationOptions = {
  parentGroup: string;
  focusCustomers: string[];
  excludeCustomers: string[];
  staticSchema?: boolean;
  includeCaseVariants?: boolean;
  normalizationKeyPrefixes?: string[];
  includeCaseVariantLayers?: Record<string, boolean>;
  includeNormalizationKeyLayers?: Record<string, boolean>;
};

type AppliesToOptions = {
  includeCaseVariants?: boolean;
  normalizationKeyPrefixes?: string[];
  includeCaseVariantLayers?: Record<string, boolean>;
  includeNormalizationKeyLayers?: Record<string, boolean>;
};

type ExpressionToken = {
  type: "expr";
  value: string;
} | {
  type: "op";
  value: "AND" | "OR";
};

export function mergeDeviceProperties(device: LMDevice) {
  const map = new Map<string, string>();
  for (const prop of [...device.customProperties, ...device.systemProperties, ...device.autoProperties]) {
    if (prop?.name) {
      map.set(prop.name, prop.value ?? "");
    }
  }
  return map;
}

export function buildGroupPath(
  schema: SchemaDefinition,
  props: Map<string, string>,
  parentGroup: string
): string | null {
  const segments: string[] = [];
  for (const layer of schema.layers) {
    const first = layer.parts[0];
    if (!first) {
      return null;
    }
    const value = props.get(first.key);
    if (!value) {
      return null;
    }
    segments.push(value);
  }
  const cleanedParent = parentGroup.replace(/\/$/, "");
  return [cleanedParent, ...segments].join("/");
}

export function buildLayerExpression(
  layer: SchemaLayer,
  props: Map<string, string>,
  literals: StaticLiteral[] = [],
  options: AppliesToOptions = {}
): string | null {
  const includeVariants = Boolean(
    options.includeCaseVariants && (options.includeCaseVariantLayers?.[layer.id] ?? true)
  );
  const includeNormalization = Boolean(
    (options.normalizationKeyPrefixes?.length ?? 0) > 0 &&
      (options.includeNormalizationKeyLayers?.[layer.id] ?? true)
  );
  const firstKey = layer.parts[0]?.key;
  const firstValue = firstKey ? props.get(firstKey) : undefined;

  const validParts = layer.parts
    .map((pill) => {
      const value = props.get(pill.key);
      const resolved = value || (pill.copyFromFirst ? firstValue : "");
      if (!resolved) {
        return null;
      }
      const operator = pill.strict || pill.mode === "eq" ? "==" : "=~";
      const valueVariants = expandValueVariants(resolved, includeVariants);
      const keyVariants = expandKeyVariants(pill.key, options.normalizationKeyPrefixes, includeNormalization);
      const exprs: string[] = [];
      keyVariants.forEach((key) => {
        valueVariants.forEach((val) => {
          exprs.push(`${key} ${operator} \"${escapeValue(val)}\"`);
        });
      });
      const expr = exprs.length > 1 ? `(${exprs.join(" || ")})` : exprs[0];
      return { pill, expr };
    })
    .filter(Boolean) as Array<{ pill: SchemaPill; expr: string }>;

  const tokens: ExpressionToken[] = [];
  validParts.forEach((entry, idx) => {
    tokens.push({ type: "expr", value: entry.expr });
    const next = validParts[idx + 1];
    if (next) {
      const connector = entry.pill.connectorToNext || "OR";
      tokens.push({ type: "op", value: connector });
    }
  });

  const expr = buildExpression(tokens);

  const literalExpr = literals
    .map((literal) => {
      const op = literal.strict ? "==" : "=~";
      const valueVariants = expandValueVariants(literal.value, includeVariants);
      const keyVariants = expandKeyVariants(literal.key, options.normalizationKeyPrefixes, includeNormalization);
      const exprs: string[] = [];
      keyVariants.forEach((key) => {
        valueVariants.forEach((val) => {
          exprs.push(`${key} ${op} \"${escapeValue(val)}\"`);
        });
      });
      return exprs.length > 1 ? `(${exprs.join(" || ")})` : exprs[0];
    })
    .filter(Boolean)
    .join(" || ");

  if (literalExpr && expr) {
    return `(${expr} || ${literalExpr})`;
  }
  if (expr) {
    return `(${expr})`;
  }
  if (literalExpr) {
    return `(${literalExpr})`;
  }
  return null;
}

export function buildAppliesTo(
  schema: SchemaDefinition,
  props: Map<string, string>,
  options: AppliesToOptions = {}
): string | null {
  const layerExprs: string[] = [];
  const survivingIndices: number[] = [];

  schema.layers.forEach((layer, index) => {
    const literals = schema.staticLayerLiterals[index] || [];
    const expr = buildLayerExpression(layer, props, literals, options);
    if (expr) {
      layerExprs.push(expr);
      survivingIndices.push(index);
    }
  });

  if (layerExprs.length === 0) {
    return null;
  }

  if (layerExprs.length === 1) {
    return layerExprs[0];
  }

  const pieces: string[] = [];
  for (let pos = 0; pos < survivingIndices.length; pos += 1) {
    pieces.push(layerExprs[pos]);
    if (pos < survivingIndices.length - 1) {
      const sepIdx = survivingIndices[pos];
      const joiner = schema.layerSeparators[sepIdx] || "AND";
      pieces.push(joiner === "AND" ? " && " : " || ");
    }
  }

  return pieces.join("");
}

export function generateGroups(
  devices: LMDevice[],
  schema: SchemaDefinition,
  options: GenerationOptions
) {
  const generated = new Map<string, GeneratedGroup>();
  const canonicalByLower = new Map<string, string>();
  const appliesToByPath = new Map<string, Map<string, number>>();

  for (const device of devices) {
    const props = mergeDeviceProperties(device);
    const path = buildGroupPath(schema, props, options.parentGroup);
    if (!path) {
      continue;
    }
    if (!passesCustomerFilter(path, options.parentGroup, options)) {
      continue;
    }
    const lowerPath = path.toLowerCase();
    const canonicalPath = canonicalByLower.get(lowerPath) ?? path;
    if (!canonicalByLower.has(lowerPath)) {
      canonicalByLower.set(lowerPath, path);
    }
    const appliesTo = options.staticSchema ? "" : buildAppliesTo(schema, props, {
      includeCaseVariants: options.includeCaseVariants,
      normalizationKeyPrefixes: options.normalizationKeyPrefixes,
      includeCaseVariantLayers: options.includeCaseVariantLayers,
      includeNormalizationKeyLayers: options.includeNormalizationKeyLayers
    });
    if (!options.staticSchema && !appliesTo) {
      continue;
    }
    const existing = generated.get(canonicalPath);
    const pathMap = appliesToByPath.get(canonicalPath) ?? new Map<string, number>();
    pathMap.set(appliesTo, (pathMap.get(appliesTo) ?? 0) + 1);
    appliesToByPath.set(canonicalPath, pathMap);

    if (existing && existing.appliesTo !== appliesTo) {
      existing.conflict = true;
      continue;
    }
    generated.set(canonicalPath, { fullPath: canonicalPath, appliesTo });
  }

  const conflicts = Array.from(appliesToByPath.entries())
    .filter(([, variants]) => variants.size > 1)
    .map(([path, variants]) => ({
      path,
      variants: Array.from(variants.entries())
        .map(([appliesTo, count]) => ({ appliesTo, count }))
        .sort((a, b) => b.count - a.count)
    }));

  conflicts.forEach((conflict) => {
    const group = generated.get(conflict.path);
    if (group) {
      group.conflict = true;
    }
  });

  return {
    groups: Array.from(generated.values()),
    conflicts
  };
}

export function buildTree(
  parentGroup: string,
  generatedGroups: GeneratedGroup[],
  portalGroupPaths: string[],
  schemaDepth?: number
): TreeNode {
  const portalByLower = new Map<string, string>();
  portalGroupPaths.forEach((path) => {
    const lower = path.toLowerCase();
    if (!portalByLower.has(lower)) {
      portalByLower.set(lower, path);
    }
  });

  const root: TreeNode = {
    name: parentGroup,
    fullPath: parentGroup,
    children: [],
    generatedCount: 0,
    portalCount: 0
  };

  const generatedSet = new Set(generatedGroups.map((g) => g.fullPath.toLowerCase()));
  const portalSet = new Set(portalGroupPaths.map((p) => p.toLowerCase()));

  const normalizedParent = parentGroup.replace(/\/$/, "");
  const prefix = normalizedParent + "/";

  // Calculate depth from generated groups if not provided
  const maxDepth = schemaDepth ?? (generatedGroups.length > 0
    ? Math.max(...generatedGroups.map(g => {
        const remainder = g.fullPath.slice(prefix.length);
        return remainder ? remainder.split("/").length : 0;
      }))
    : Infinity);

  const addPath = (path: string, limitDepth: boolean = false) => {
    if (!path.startsWith(prefix)) {
      return;
    }
    const remainder = path.slice(prefix.length);
    if (!remainder) {
      return;
    }
    const parts = remainder.split("/");

    // If limiting depth, only add paths that match schema depth
    if (limitDepth && parts.length > maxDepth) {
      return;
    }

    let current = root;
    let full = normalizedParent;
    for (const part of parts) {
      full = `${full}/${part}`;
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: full,
          children: [],
          generatedCount: 0,
          portalCount: 0
        };
        current.children.push(child);
      }
      current = child;
    }
  };

  // Add all generated groups (these define the schema structure)
  for (const g of generatedGroups) {
    const canonical = portalByLower.get(g.fullPath.toLowerCase()) ?? g.fullPath;
    addPath(canonical, false);
  }

  // Only add portal groups that match the schema depth
  for (const p of portalGroupPaths) {
    const canonical = portalByLower.get(p.toLowerCase()) ?? p;
    addPath(canonical, true);
  }

  const computeCounts = (node: TreeNode) => {
    const lower = node.fullPath.toLowerCase();
    node.generatedCount = generatedSet.has(lower) ? 1 : 0;
    node.portalCount = portalSet.has(lower) ? 1 : 0;
    node.children.forEach(computeCounts);
    node.generatedCount += node.children.reduce((sum, c) => sum + c.generatedCount, 0);
    node.portalCount += node.children.reduce((sum, c) => sum + c.portalCount, 0);
  };

  computeCounts(root);
  return root;
}

function buildExpression(tokens: ExpressionToken[]) {
  if (tokens.length === 0) {
    return null;
  }
  const output: ExpressionToken[] = [];
  const ops: ExpressionToken[] = [];
  const precedence = (op: "AND" | "OR") => (op === "AND" ? 2 : 1);

  tokens.forEach((token) => {
    if (token.type === "expr") {
      output.push(token);
      return;
    }
    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top.type === "op" && precedence(top.value) >= precedence(token.value)) {
        output.push(ops.pop() as ExpressionToken);
      } else {
        break;
      }
    }
    ops.push(token);
  });

  while (ops.length) {
    output.push(ops.pop() as ExpressionToken);
  }

  const stack: string[] = [];
  output.forEach((token) => {
    if (token.type === "expr") {
      stack.push(token.value);
      return;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (!left || !right) {
      return;
    }
    stack.push(`(${left} ${token.value === "AND" ? "&&" : "||"} ${right})`);
  });

  return stack[0] || null;
}

function escapeValue(value: string) {
  return value.replace(/"/g, "\\\"");
}

function expandValueVariants(value: string, includeCaseVariants?: boolean) {
  if (!includeCaseVariants) {
    return [value];
  }
  const variants = new Set<string>();
  variants.add(value);
  variants.add(value.toUpperCase());
  variants.add(value.toLowerCase());
  if (!value.includes(".")) {
    const title = value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
    variants.add(title);
  }
  return Array.from(variants);
}

function expandKeyVariants(
  key: string,
  prefixes: string[] | undefined,
  includeNormalizationKeys?: boolean
) {
  if (!includeNormalizationKeys || !prefixes || prefixes.length === 0) {
    return [key];
  }
  if (key.includes("normalization.")) {
    return [key];
  }
  const variants = new Set<string>();
  variants.add(key);
  prefixes.forEach((prefix) => {
    const cleaned = prefix.replace(/\.$/, "");
    if (cleaned) {
      variants.add(`${cleaned}.${key}`);
    }
  });
  return Array.from(variants);
}

function passesCustomerFilter(
  groupPath: string,
  parentGroup: string,
  options: GenerationOptions
) {
  const prefix = parentGroup.replace(/\/$/, "") + "/";
  const remainder = groupPath.startsWith(prefix) ? groupPath.slice(prefix.length) : groupPath;
  const value = remainder.split("/", 1)[0] || "";
  const lowerValue = value.toLowerCase();
  if (options.excludeCustomers.length > 0) {
    if (options.excludeCustomers.map((v) => v.toLowerCase()).includes(lowerValue)) {
      return false;
    }
  }
  if (options.focusCustomers.length > 0) {
    return options.focusCustomers.map((v) => v.toLowerCase()).includes(lowerValue);
  }
  return true;
}
