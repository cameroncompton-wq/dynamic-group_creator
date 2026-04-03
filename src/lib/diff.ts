import type { DiffBuckets, DiffRow, GeneratedGroup, LMGroup } from "./types";

export function diffGroups(
  generated: GeneratedGroup[],
  portalGroups: LMGroup[]
): DiffBuckets {
  const portalMap = new Map<string, LMGroup>();
  portalGroups.forEach((group) => portalMap.set(group.fullPath.toLowerCase(), group));

  const missing: DiffRow[] = [];
  const needsUpdate: DiffRow[] = [];
  const matches: DiffRow[] = [];
  const staticInPortal: DiffRow[] = [];

  generated.forEach((gen) => {
    const portal = portalMap.get(gen.fullPath.toLowerCase());
    if (!portal) {
      missing.push({
        existsInPortal: false,
        fullPath: gen.fullPath,
        current_applies_to: "",
        new_applies_to: gen.appliesTo,
        selected: true
      });
      return;
    }

    const isDynamic = Boolean(portal.appliesTo && portal.appliesTo.trim().length > 0);
    const current = portal.appliesTo || "";

    if (!isDynamic) {
      staticInPortal.push({
        id: portal.id,
        existsInPortal: true,
        fullPath: portal.fullPath,
        current_applies_to: current,
        new_applies_to: gen.appliesTo,
        numOfHosts: portal.numOfHosts,
        isDynamic: false,
        selected: false
      });
      return;
    }

    if (normalize(current) !== normalize(gen.appliesTo)) {
      needsUpdate.push({
        id: portal.id,
        existsInPortal: true,
        fullPath: portal.fullPath,
        current_applies_to: current,
        new_applies_to: gen.appliesTo,
        numOfHosts: portal.numOfHosts,
        isDynamic: true,
        selected: true
      });
    } else {
      matches.push({
        id: portal.id,
        existsInPortal: true,
        fullPath: portal.fullPath,
        current_applies_to: current,
        new_applies_to: gen.appliesTo,
        numOfHosts: portal.numOfHosts,
        isDynamic: true,
        selected: false
      });
    }
  });

  return { missing, needsUpdate, matches, staticInPortal };
}

export function mergeCSVRows(rows: DiffRow[], portalGroups: LMGroup[]) {
  const portalMap = new Map<string, LMGroup>();
  portalGroups.forEach((group) => portalMap.set(group.fullPath.toLowerCase(), group));

  return rows.map((row) => {
    const portal = portalMap.get(row.fullPath.toLowerCase());
    if (!portal) {
      return row;
    }
    return {
      ...row,
      id: portal.id,
      existsInPortal: true,
      current_applies_to: portal.appliesTo || "",
      numOfHosts: portal.numOfHosts,
      isDynamic: Boolean(portal.appliesTo && portal.appliesTo.trim())
    };
  });
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
