"use client";

import { Suspense, lazy } from "react";
import type { TreeNode } from "../../lib/types";

// Lazy load the 3D canvas component
const Tree3DCanvasLazy = lazy(() => import("./Tree3DCanvas"));

interface Tree3DWrapperProps {
  tree: TreeNode;
  statusByPath: Map<string, string>;
  selectedLeaf: string | null;
  collapsed: Record<string, boolean>;
  onSelect: (fullPath: string) => void;
  onToggle: (fullPath: string) => void;
}

function LoadingFallback() {
  return (
    <div className="tree-3d-loading">
      <div className="loading" />
      <span>Loading 3D view...</span>
    </div>
  );
}

export default function Tree3DWrapper(props: Tree3DWrapperProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Tree3DCanvasLazy {...props} />
    </Suspense>
  );
}
