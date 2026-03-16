import { useMemo } from "react";
import type { GraphData } from "@/components/finance/KnowledgeBaseTab";
import { Brain, FileText, MessageSquare, Sparkles, Link2 } from "lucide-react";

interface Props {
  graphData: GraphData | null;
}

interface Node {
  id: string;
  label: string;
  type: "core" | "memory" | "knowledge" | "document";
  x: number;
  y: number;
  size: number;
}

export function KnowledgeGraph({ graphData }: Props) {
  const totalItems = graphData?.entities.length ?? 0;

  const nodes = useMemo(() => {
    if (!graphData) return [];
    const result: Node[] = [];
    const cx = 250, cy = 200;

    // Central node
    result.push({ id: "core", label: "Agent Brain", type: "core", x: cx, y: cy, size: 40 });

    // Distribute entities by type in concentric rings
    const memories = graphData.entities.filter(e => e.type === "memory");
    const knowledge = graphData.entities.filter(e => e.type === "knowledge");
    const documents = graphData.entities.filter(e => e.type === "document");

    // Memories in inner ring (closest to brain)
    memories.forEach((e, i) => {
      const angle = (i / Math.max(memories.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = 80 + (i % 3) * 15;
      result.push({
        id: e.id,
        label: e.label.length > 20 ? e.label.slice(0, 20) + "\u2026" : e.label,
        type: "memory",
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        size: 22,
      });
    });

    // Knowledge entries in middle ring
    knowledge.forEach((e, i) => {
      const angle = (i / Math.max(knowledge.length, 1)) * Math.PI * 2 - Math.PI / 4;
      const r = 120 + (i % 3) * 15;
      result.push({
        id: e.id,
        label: e.label.length > 20 ? e.label.slice(0, 20) + "\u2026" : e.label,
        type: "knowledge",
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        size: 20 + Math.min(e.content.length / 200, 10),
      });
    });

    // Documents in outer ring
    documents.forEach((d, i) => {
      const angle = (i / Math.max(documents.length, 1)) * Math.PI * 2;
      const r = 165 + (i % 2) * 12;
      result.push({
        id: d.id,
        label: d.label.length > 18 ? d.label.slice(0, 18) + "\u2026" : d.label,
        type: "document",
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        size: 18,
      });
    });

    return result;
  }, [graphData]);

  // Build edge lookup from relationship data
  const edges = useMemo(() => {
    if (!graphData) return [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const result: Array<{ x1: number; y1: number; x2: number; y2: number; type: string }> = [];

    // Connect all non-core nodes to core
    for (const n of nodes) {
      if (n.id === "core") continue;
      result.push({
        x1: nodes[0].x,
        y1: nodes[0].y,
        x2: n.x,
        y2: n.y,
        type: "radial",
      });
    }

    // Add relationship edges from graph data
    for (const rel of graphData.relationships) {
      const source = nodeMap.get(rel.source);
      const target = nodeMap.get(rel.target);
      if (source && target) {
        result.push({
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          type: rel.type,
        });
      }
    }

    return result;
  }, [graphData, nodes]);

  const typeColors: Record<string, string> = {
    core: "hsl(var(--primary))",
    memory: "hsl(var(--chart-1))",
    knowledge: "hsl(var(--accent))",
    document: "hsl(var(--chart-3))",
  };

  if (totalItems === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Brain className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Knowledge map is empty</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          As you chat with your agent and upload documents, the knowledge map will grow to visualize everything your agent knows.
        </p>
      </div>
    );
  }

  const stats = graphData?.stats;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[400px] relative">
      {/* Stats bar */}
      <div className="flex items-center gap-4 p-4 border-b border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">{totalItems}</span> knowledge nodes
        </div>
        {(stats?.memories ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" style={{ color: typeColors.memory }} />
            <span>{stats?.memories}</span> memories
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-accent" />
          <span>{stats?.knowledgeEntries ?? 0}</span> insights
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" style={{ color: typeColors.document }} />
          <span>{stats?.documents ?? 0}</span> documents
        </div>
        {(stats?.connections ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{stats?.connections}</span> connections
          </div>
        )}
      </div>

      {/* SVG Graph */}
      <svg viewBox="0 0 500 400" className="w-full h-auto" style={{ minHeight: 350 }}>
        {/* Radial connection lines (faint) */}
        {edges.filter(e => e.type === "radial").map((e, i) => (
          <line
            key={`radial-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
            strokeDasharray="4 4"
            opacity={0.4}
          />
        ))}

        {/* Relationship edges (more visible) */}
        {edges.filter(e => e.type !== "radial").map((e, i) => (
          <line
            key={`rel-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            opacity={0.5}
          />
        ))}

        {/* Nodes */}
        {nodes.map(n => (
          <g key={n.id}>
            {/* Glow for core */}
            {n.type === "core" && (
              <circle cx={n.x} cy={n.y} r={n.size + 8} fill={typeColors[n.type]} opacity={0.15}>
                <animate attributeName="r" values={`${n.size + 6};${n.size + 12};${n.size + 6}`} dur="3s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size / 2}
              fill={typeColors[n.type]}
              opacity={n.type === "core" ? 1 : 0.85}
            />
            <text
              x={n.x}
              y={n.y + n.size / 2 + 12}
              textAnchor="middle"
              fontSize={n.type === "core" ? 11 : 8}
              fill="hsl(var(--muted-foreground))"
              fontWeight={n.type === "core" ? 600 : 400}
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
