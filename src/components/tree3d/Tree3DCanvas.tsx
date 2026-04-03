"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import type { TreeNode } from "../../lib/types";
import { useTreeLayout } from "./useTreeLayout";
import { Tree3DScene } from "./Tree3DScene";
import { THEME } from "./colors";

interface Tree3DCanvasProps {
  tree: TreeNode;
  statusByPath: Map<string, string>;
  selectedLeaf: string | null;
  collapsed: Record<string, boolean>;
  onSelect: (fullPath: string) => void;
  onToggle: (fullPath: string) => void;
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#60a5fa" wireframe />
    </mesh>
  );
}

export default function Tree3DCanvas({
  tree,
  statusByPath,
  selectedLeaf,
  collapsed,
  onSelect,
  onToggle,
}: Tree3DCanvasProps) {
  const layoutResult = useTreeLayout(tree, collapsed);

  if (!layoutResult) {
    return null;
  }

  const { layout, boundingBox } = layoutResult;

  return (
    <div className="tree-3d-container">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ background: THEME.background }}
      >
        <color attach="background" args={[THEME.background]} />
        <fog attach="fog" args={[THEME.background, 30, 80]} />

        <Suspense fallback={<LoadingFallback />}>
          <Tree3DScene
            layout={layout}
            boundingBox={boundingBox}
            statusByPath={statusByPath}
            selectedLeaf={selectedLeaf}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        </Suspense>
      </Canvas>

      {/* Controls hint overlay */}
      <div className="tree-3d-controls-hint">
        <span>Drag to rotate</span>
        <span>Scroll to zoom</span>
        <span>Arrow keys to pan</span>
        <span>W/S to move forward/back</span>
        <span>Click to select</span>
        <span>Double-click to expand/collapse</span>
      </div>
    </div>
  );
}
