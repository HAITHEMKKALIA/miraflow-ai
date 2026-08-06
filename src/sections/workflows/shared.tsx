export interface SeedNode {
  id: string;
  position: { x: number; y: number };
  data: {
    kind: string;
    label: string;
    config: Record<string, unknown>;
  };
}

export interface SeedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export const VERSION_BY_ID: Record<string, number> = {};

export const seedGraph = (_id: string): { nodes: SeedNode[]; edges: SeedEdge[] } => ({
  nodes: [],
  edges: [],
});
