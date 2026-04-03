"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { LayoutEdge } from "./TreeLayoutEngine";
import { THEME } from "./colors";

interface TreeEdge3DProps {
  edge: LayoutEdge;
}

export function TreeEdge3D({ edge }: TreeEdge3DProps) {
  // Create a curved path from parent to child
  const points = useMemo(() => {
    const [x1, y1, z1] = edge.from;
    const [x2, y2, z2] = edge.to;

    // Create a smooth curve with an intermediate point
    const midZ = (z1 + z2) / 2;

    return [
      [x1, y1, z1],
      [x1, y1, midZ], // Drop straight down first
      [x2, y2, midZ], // Then move horizontally
      [x2, y2, z2],   // Then continue to child
    ] as [number, number, number][];
  }, [edge.from, edge.to]);

  return (
    <Line
      points={points}
      color={THEME.edge}
      lineWidth={1.5}
      opacity={0.6}
      transparent
    />
  );
}

interface TreeEdges3DProps {
  edges: LayoutEdge[];
}

export function TreeEdges3D({ edges }: TreeEdges3DProps) {
  return (
    <group>
      {edges.map((edge) => (
        <TreeEdge3D key={edge.id} edge={edge} />
      ))}
    </group>
  );
}
