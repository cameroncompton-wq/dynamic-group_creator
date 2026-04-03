import type { TreeNode } from "../../lib/types";

export interface LayoutNode {
  id: string;
  name: string;
  fullPath: string;
  position: [number, number, number]; // x, y, z
  depth: number;
  parentId: string | null;
  children: string[];
  isExpanded: boolean;
}

export interface LayoutEdge {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  fromId: string;
  toId: string;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

const LAYER_SPACING_Z = 4; // Distance between layers on Z axis
const SIBLING_SPACING_X = 2.5; // Base spacing between siblings on X axis
const Y_VARIATION = 0.2; // Slight Y variation for visual interest

/**
 * Horizontal layers layout algorithm
 *
 * Creates a "floating shelves" effect where:
 * - Z-axis: Tree depth (root at front Z=0, children recede into depth)
 * - X-axis: Siblings spread horizontally, centered under parent
 * - Y-axis: Minimal variation for visual interest
 */
export function computeTreeLayout(
  root: TreeNode,
  collapsed: Record<string, boolean>
): TreeLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // First pass: calculate subtree widths for centering
  const subtreeWidths = new Map<string, number>();

  function calculateWidth(node: TreeNode): number {
    const isExpanded = !collapsed[node.fullPath];
    const visibleChildren = isExpanded ? node.children : [];

    if (visibleChildren.length === 0) {
      subtreeWidths.set(node.fullPath, 1);
      return 1;
    }

    let totalWidth = 0;
    for (const child of visibleChildren) {
      totalWidth += calculateWidth(child);
    }
    // Add spacing between children
    totalWidth += (visibleChildren.length - 1) * 0.5;
    subtreeWidths.set(node.fullPath, Math.max(1, totalWidth));
    return Math.max(1, totalWidth);
  }

  calculateWidth(root);

  // Second pass: assign positions
  function assignPositions(
    node: TreeNode,
    depth: number,
    xCenter: number,
    parentId: string | null
  ): void {
    const isExpanded = !collapsed[node.fullPath];
    const visibleChildren = isExpanded ? node.children : [];

    // Calculate Y with slight variation based on depth and position
    const yVariation = (Math.sin(xCenter * 0.5 + depth) * Y_VARIATION);

    const layoutNode: LayoutNode = {
      id: node.fullPath,
      name: node.name,
      fullPath: node.fullPath,
      position: [
        xCenter,
        yVariation,
        -depth * LAYER_SPACING_Z
      ],
      depth,
      parentId,
      children: visibleChildren.map(c => c.fullPath),
      isExpanded,
    };

    nodes.push(layoutNode);

    // Create edge from parent to this node
    if (parentId) {
      const parentNode = nodes.find(n => n.id === parentId);
      if (parentNode) {
        edges.push({
          id: `${parentId}->${node.fullPath}`,
          from: parentNode.position,
          to: layoutNode.position,
          fromId: parentId,
          toId: node.fullPath,
        });
      }
    }

    // Position children centered under this node
    if (visibleChildren.length > 0) {
      const childWidths = visibleChildren.map(c => subtreeWidths.get(c.fullPath) || 1);
      const totalChildWidth = childWidths.reduce((a, b) => a + b, 0) +
                              (visibleChildren.length - 1) * 0.5;

      let currentX = xCenter - totalChildWidth * SIBLING_SPACING_X / 2;

      for (let i = 0; i < visibleChildren.length; i++) {
        const child = visibleChildren[i];
        const childWidth = childWidths[i];
        const childCenter = currentX + (childWidth * SIBLING_SPACING_X) / 2;

        assignPositions(child, depth + 1, childCenter, node.fullPath);

        currentX += childWidth * SIBLING_SPACING_X + 0.5 * SIBLING_SPACING_X;
      }
    }
  }

  assignPositions(root, 0, 0, null);

  return { nodes, edges };
}

/**
 * Calculate bounding box of all nodes for camera positioning
 */
export function getBoundingBox(layout: TreeLayout): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
} {
  if (layout.nodes.length === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
    };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const node of layout.nodes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], node.position[i]);
      max[i] = Math.max(max[i], node.position[i]);
    }
  }

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  return { min, max, center };
}
