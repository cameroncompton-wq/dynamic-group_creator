import { useMemo } from "react";
import type { TreeNode } from "../../lib/types";
import { computeTreeLayout, getBoundingBox, type TreeLayout } from "./TreeLayoutEngine";

export interface UseTreeLayoutResult {
  layout: TreeLayout;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
  };
}

/**
 * Hook to compute 3D positions from TreeNode data
 * Memoized to prevent unnecessary recalculations
 */
export function useTreeLayout(
  tree: TreeNode | null,
  collapsed: Record<string, boolean>
): UseTreeLayoutResult | null {
  return useMemo(() => {
    if (!tree) return null;

    const layout = computeTreeLayout(tree, collapsed);
    const boundingBox = getBoundingBox(layout);

    return { layout, boundingBox };
  }, [tree, collapsed]);
}
