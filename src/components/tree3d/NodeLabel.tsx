"use client";

import { Html } from "@react-three/drei";
import type { LayoutNode } from "./TreeLayoutEngine";
import { getNodeColor, getStatusColor, THEME } from "./colors";

interface NodeLabelProps {
  node: LayoutNode;
  status?: string;
  isSelected: boolean;
}

export function NodeLabel({ node, status, isSelected }: NodeLabelProps) {
  const statusColor = getStatusColor(status);
  const nodeColor = statusColor || getNodeColor(node.depth);

  const statusLabels: Record<string, { icon: string; text: string }> = {
    missing: { icon: '+', text: 'New' },
    update: { icon: '↺', text: 'Update' },
    match: { icon: '✓', text: 'Synced' },
    static: { icon: '■', text: 'Static' },
  };

  const statusInfo = status ? statusLabels[status] : null;

  return (
    <Html
      position={[node.position[0], node.position[1] + 0.7, node.position[2]]}
      center
      distanceFactor={8}
      occlude={false}
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {/* Node name label */}
        <div
          style={{
            background: isSelected
              ? `rgba(245, 158, 11, 0.9)`
              : `rgba(15, 17, 23, 0.85)`,
            color: isSelected ? '#0f1117' : nodeColor,
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
            whiteSpace: 'nowrap',
            border: `1.5px solid ${isSelected ? THEME.selected : nodeColor}`,
            boxShadow: isSelected
              ? `0 0 12px ${THEME.selectedGlow}`
              : '0 2px 8px rgba(0, 0, 0, 0.3)',
            maxWidth: '150px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {node.name}
        </div>

        {/* Status badge */}
        {statusInfo && (
          <div
            style={{
              background: `${statusColor}20`,
              color: statusColor || '#9ca3af',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap',
              border: `1px solid ${statusColor}50`,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{statusInfo.icon}</span>
            <span>{statusInfo.text}</span>
          </div>
        )}
      </div>
    </Html>
  );
}
