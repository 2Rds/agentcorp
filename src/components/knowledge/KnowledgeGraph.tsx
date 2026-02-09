import { useMemo } from "react";
import type { KnowledgeEntry, DocumentEntry } from "@/pages/Knowledge";
import { Brain, FileText, MessageSquare, Sparkles } from "lucide-react";

interface Props {
  entries: KnowledgeEntry[];
  documents: DocumentEntry[];
}

interface Node {
  id: string;
  label: string;
  type: "core" | "knowledge" | "document" | "topic";
  x: number;
  y: number;
  size: number;
}

export function KnowledgeGraph({ entries, documents }: Props) {
  const totalItems = entries.length + documents.length;

  const nodes = useMemo(() => {
    const result: Node[] = [];
    const cx = 250, cy = 200;

    // Central node
    result.push({ id: "core", label: "Agent Brain", type: "core", x: cx, y: cy, size: 40 });

    // Knowledge entries in inner ring
    entries.forEach((e, i) => {
      const angle = (i / Math.max(entries.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = 100 + Math.random() * 30;
      result.push({
        id: e.id,
        label: e.title.length > 20 ? e.title.slice(0, 20) + "…" : e.title,
        type: "knowledge",
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        size: 20 + Math.min(e.content.length / 200, 10),
      });
    });

    // Documents in outer ring
    documents.forEach((d, i) => {
      const angle = (i / Math.max(documents.length, 1)) * Math.PI * 2;
      const r = 160 + Math.random() * 20;
      result.push({
        id: d.id,
        label: d.name.length > 18 ? d.name.slice(0, 18) + "…" : d.name,
        type: "document",
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        size: 18,
      });
    });

    return result;
  }, [entries, documents]);

  const typeColors: Record<string, string> = {
    core: "hsl(var(--primary))",
    knowledge: "hsl(var(--accent))",
    document: "hsl(var(--chart-3))",
    topic: "hsl(var(--chart-4))",
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[400px] relative">
      {/* Stats bar */}
      <div className="flex items-center gap-4 p-4 border-b border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">{totalItems}</span> knowledge nodes
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-accent" />
          <span>{entries.length}</span> insights
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" style={{ color: "hsl(var(--chart-3))" }} />
          <span>{documents.length}</span> documents
        </div>
      </div>

      {/* SVG Graph */}
      <svg viewBox="0 0 500 400" className="w-full h-auto" style={{ minHeight: 350 }}>
        {/* Connection lines */}
        {nodes.filter(n => n.id !== "core").map(n => (
          <line
            key={`line-${n.id}`}
            x1={nodes[0].x}
            y1={nodes[0].y}
            x2={n.x}
            y2={n.y}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.6}
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
