"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LayoutNode } from "./TreeLayoutEngine";
import { getNodeColor, getStatusColor, THEME } from "./colors";

interface TreeNode3DProps {
  node: LayoutNode;
  status?: string;
  isSelected: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onSelect: (fullPath: string) => void;
  onToggle: (fullPath: string) => void;
}

export function TreeNode3D({
  node,
  status,
  isSelected,
  hasChildren,
  isExpanded,
  onSelect,
  onToggle,
}: TreeNode3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Animate scale on hover
  useFrame(() => {
    if (meshRef.current) {
      const targetScale = hovered ? 1.2 : isSelected ? 1.1 : 1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  // Determine color based on status or depth
  const statusColor = getStatusColor(status);
  const baseColor = statusColor || getNodeColor(node.depth);
  const color = isSelected ? THEME.selected : baseColor;

  // Sphere size based on whether it has children
  const radius = hasChildren ? 0.4 : 0.3;

  return (
    <group position={node.position}>
      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.fullPath);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (hasChildren) {
            onToggle(node.fullPath);
          }
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.4 : isSelected ? 0.3 : 0.1}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius + 0.15, radius + 0.25, 32]} />
          <meshBasicMaterial
            color={THEME.selected}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Expand/collapse indicator for nodes with children */}
      {hasChildren && (
        <mesh
          position={[0, -radius - 0.15, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.fullPath);
          }}
        >
          <boxGeometry args={[0.15, 0.15, 0.05]} />
          <meshBasicMaterial
            color={isExpanded ? "#60a5fa" : "#fbbf24"}
          />
        </mesh>
      )}
    </group>
  );
}
