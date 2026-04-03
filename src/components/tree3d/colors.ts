// Theme colors for 3D tree visualization
// Based on CSS variables from globals.css

export const THEME = {
  background: '#0f1117',
  nodeColors: {
    0: '#fbbf24',  // yellow (layer 0 - root)
    1: '#60a5fa',  // blue (layer 1)
    2: '#a78bfa',  // purple (layer 2)
    3: '#34d399',  // green (layer 3+)
  } as Record<number, string>,
  status: {
    missing: '#a78bfa',   // purple - new group
    update: '#fbbf24',    // yellow - needs update
    match: '#34d399',     // green - synced
    static: '#9ca3af',    // gray - static
  },
  edge: '#3d4451',
  edgeHover: '#5d6677',
  selected: '#f59e0b',
  selectedGlow: 'rgba(245, 158, 11, 0.4)',
};

export function getNodeColor(depth: number): string {
  const maxDepth = 3;
  return THEME.nodeColors[Math.min(depth, maxDepth)];
}

export function getStatusColor(status: string | undefined): string | null {
  if (!status) return null;
  return THEME.status[status as keyof typeof THEME.status] || null;
}
