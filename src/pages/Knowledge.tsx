import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { getClerkSession } from "@/lib/clerk-session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeGraph } from "@/components/knowledge/KnowledgeGraph";
import { KnowledgeDocuments } from "@/components/knowledge/KnowledgeDocuments";
import { Brain, FileText } from "lucide-react";

export interface KnowledgeEntry {
  id: string;
  title: string;
  source: string | null;
  content: string;
  created_at: string;
}

export interface DocumentEntry {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
  tags: string[] | null;
}

export interface GraphEntity {
  id: string;
  label: string;
  type: "memory" | "knowledge" | "document";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface GraphRelationship {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  stats: {
    memories: number;
    knowledgeEntries: number;
    documents: number;
    connections: number;
  };
}

const DOCUMENT_SELECT = "id, name, mime_type, size_bytes, storage_path, created_at, tags" as const;

export default function Knowledge() {
  const { orgId } = useOrganization();
  const { user } = useAuth();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchDocuments(organizationId: string): Promise<DocumentEntry[]> {
    const { data } = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    return (data as DocumentEntry[]) ?? [];
  }

  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      setLoading(true);

      const agentUrl = import.meta.env.VITE_AGENT_URL;
      const session = getClerkSession();
      const token = session ? await session.getToken() : null;
      if (!token) console.warn("No Clerk session token — agent requests will fail");

      // Try agent server knowledge graph endpoint
      let fetchedFromAgent = false;
      if (agentUrl && token) {
        try {
          const resp = await fetch(`${agentUrl}/api/knowledge/graph?organizationId=${orgId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            setGraphData(await resp.json());
            fetchedFromAgent = true;
          }
        } catch (err) {
          console.warn("Knowledge graph agent fetch failed, using Supabase fallback:", err);
        }
      }

      const docs = await fetchDocuments(orgId);
      setDocuments(docs);

      // If graph data was not fetched from agent, build it from Supabase
      if (!fetchedFromAgent) {
        const { data: kbData } = await supabase
          .from("knowledge_base")
          .select("id, title, source, content, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        const entries = (kbData as KnowledgeEntry[]) ?? [];

        const entities: GraphEntity[] = [
          ...entries.map(e => ({
            id: `kb-${e.id}`,
            label: e.title,
            type: "knowledge" as const,
            content: e.content,
          })),
          ...docs.map(d => ({
            id: `doc-${d.id}`,
            label: d.name,
            type: "document" as const,
            content: d.name,
          })),
        ];

        setGraphData({
          entities,
          relationships: [],
          stats: {
            memories: 0,
            knowledgeEntries: entries.length,
            documents: docs.length,
            connections: 0,
          },
        });
      }

      setLoading(false);
    };
    load();
  }, [orgId]);

  const handleUpload = async (files: File[]) => {
    if (!orgId || !user) return;
    for (const file of files) {
      const path = `${orgId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("agent-documents").upload(path, file);
      if (uploadErr) { console.error("Upload error:", uploadErr); continue; }

      const { error: dbErr } = await supabase.from("documents").insert({
        organization_id: orgId,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      });
      if (dbErr) console.error("DB error:", dbErr);
    }

    setDocuments(await fetchDocuments(orgId));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">Your agent's growing context — documents, insights, and learned knowledge.</p>
      </div>

      <Tabs defaultValue="graph" className="flex-1 flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="graph" className="gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            Knowledge Map
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="graph" className="flex-1 mt-4">
          <KnowledgeGraph graphData={graphData} />
        </TabsContent>

        <TabsContent value="documents" className="flex-1 mt-4">
          <KnowledgeDocuments documents={documents} onUpload={handleUpload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
