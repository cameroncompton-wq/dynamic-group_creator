"use client";

import { useRef, useEffect } from "react";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TreeNode } from "../../lib/types";
import type { TreeLayout } from "./TreeLayoutEngine";
import { TreeNode3D } from "./TreeNode3D";
import { TreeEdges3D } from "./TreeEdge3D";
import { NodeLabel } from "./NodeLabel";
import { THEME } from "./colors";

interface Tree3DSceneProps {
  layout: TreeLayout;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
  };
  statusByPath: Map<string, string>;
  selectedLeaf: string | null;
  collapsed: Record<string, boolean>;
  onSelect: (fullPath: string) => void;
  onToggle: (fullPath: string) => void;
}

export function Tree3DScene({
  layout,
  boundingBox,
  statusByPath,
  selectedLeaf,
  collapsed,
  onSelect,
  onToggle,
}: Tree3DSceneProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // Calculate optimal camera position based on tree size
  useEffect(() => {
    const { min, max, center } = boundingBox;
    const width = max[0] - min[0];
    const depth = Math.abs(max[2] - min[2]);

    // Position camera to see the whole tree
    const distance = Math.max(width, depth, 10) * 1.5;

    camera.position.set(
      center[0],
      center[1] + distance * 0.5,
      center[2] + distance
    );

    if (controlsRef.current) {
      controlsRef.current.target.set(center[0], center[1], center[2] - depth * 0.3);
      controlsRef.current.update();
    }
  }, [boundingBox, camera]);

  useEffect(() => {
    const shouldIgnore = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnore()) return;
      const key = event.key.toLowerCase();
      const stepBase = Math.max(
        Math.max(boundingBox.max[0] - boundingBox.min[0], Math.abs(boundingBox.max[2] - boundingBox.min[2])) * 0.02,
        0.5
      );
      const step = event.shiftKey ? stepBase * 2 : stepBase;
      let dx = 0;
      let dy = 0;
      let dz = 0;

      if (key === "arrowleft" || key === "a") dx = -step;
      if (key === "arrowright" || key === "d") dx = step;
      if (key === "arrowup") dy = step;
      if (key === "arrowdown") dy = -step;
      if (key === "w") dz = step;
      if (key === "s") dz = -step;

      if (dx === 0 && dy === 0 && dz === 0) return;
      event.preventDefault();

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = camera.up.clone().normalize();
      const forwardNorm = forward.clone().normalize();
      const delta = new THREE.Vector3()
        .addScaledVector(right, dx)
        .addScaledVector(up, dy)
        .addScaledVector(forwardNorm, dz);

      camera.position.add(delta);
      if (controlsRef.current) {
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [boundingBox, camera]);

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera
        makeDefault
        fov={50}
        near={0.1}
        far={1000}
      />

      {/* Controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 10]}
        intensity={0.8}
        castShadow
      />
      <directionalLight
        position={[-10, 5, -10]}
        intensity={0.3}
      />
      <pointLight
        position={[0, 5, 0]}
        intensity={0.5}
        color={THEME.nodeColors[0]}
      />

      {/* Grid helper for spatial reference */}
      <gridHelper
        args={[50, 50, '#1a1d26', '#1a1d26']}
        position={[0, -2, -10]}
        rotation={[0, 0, 0]}
      />

      {/* Edges */}
      <TreeEdges3D edges={layout.edges} />

      {/* Nodes */}
      {layout.nodes.map((node) => (
        <TreeNode3D
          key={node.id}
          node={node}
          status={statusByPath.get(node.fullPath)}
          isSelected={selectedLeaf === node.fullPath}
          hasChildren={node.children.length > 0 || (!node.isExpanded && !collapsed[node.fullPath])}
          isExpanded={node.isExpanded}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}

      {/* Labels */}
      {layout.nodes.map((node) => (
        <NodeLabel
          key={`label-${node.id}`}
          node={node}
          status={statusByPath.get(node.fullPath)}
          isSelected={selectedLeaf === node.fullPath}
        />
      ))}
    </>
  );
}
