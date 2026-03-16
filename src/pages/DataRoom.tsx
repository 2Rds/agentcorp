import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { DataRoomAuth } from "@/components/dataroom/DataRoomAuth";
import { DataRoomLayout } from "@/components/dataroom/DataRoomLayout";
import { DataRoomDashboard } from "@/components/dataroom/DataRoomDashboard";
import { DataRoomChat } from "@/components/dataroom/DataRoomChat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MessageSquare } from "lucide-react";

interface DataRoomConfig {
  linkName: string;
  organizationName: string;
  requireEmail: boolean;
  hasPasscode: boolean;
}

export default function DataRoom() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<DataRoomConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [viewerEmail, setViewerEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [sessionId] = useState(() => crypto.randomUUID());

  const agentUrl = import.meta.env.VITE_AGENT_URL as string | undefined;

  // Initial link validation
  useEffect(() => {
    if (!slug) { setError("Invalid data room link"); setLoading(false); return; }
    if (!agentUrl) { setError("Data room service unavailable"); setLoading(false); return; }
    const validate = async () => {
      try {
        const resp = await fetch(`${agentUrl}/dataroom/${slug}`);
        const data = await resp.json();
        if (!resp.ok) {
          if (data.requireEmail) {
            setConfig(data);
          } else {
            setError(data.error || "Link not found");
          }
          return;
        }
        setConfig(data);
        if (!data.hasPasscode && !data.requireEmail) {
          setAuthenticated(true);
        }
      } catch {
        setError("Unable to connect to data room");
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [slug, agentUrl]);

  const handleAuth = async (email: string, code: string) => {
    if (!slug || !agentUrl) throw new Error("Data room not configured");

    const resp = await fetch(`${agentUrl}/dataroom/${slug}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email || undefined, passcode: code || undefined }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);

    setConfig(data);
    setViewerEmail(email);
    setPasscode(code);
    setAuthenticated(true);

    // Track view
    fetch(`${agentUrl}/dataroom/${slug}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, passcode: code, sessionId, interactionType: "chart_view" }),
    }).catch(err => console.warn("View tracking failed:", err));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Data Room Unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <DataRoomAuth
        companyName={config?.organizationName ?? "Company"}
        requireEmail={config?.requireEmail ?? false}
        hasPasscode={config?.hasPasscode ?? false}
        onAuth={handleAuth}
      />
    );
  }

  // Pass credentials via headers (not query params) to avoid leaking in logs/history
  const authHeaders: Record<string, string> = {};
  if (viewerEmail) authHeaders["x-viewer-email"] = viewerEmail;
  if (passcode) authHeaders["x-viewer-passcode"] = passcode;
  const authQuery = ""; // deprecated — credentials sent via headers now

  return (
    <DataRoomLayout companyName={config?.organizationName ?? "Company"} linkName={config?.linkName ?? ""}>
      <Tabs defaultValue="dashboard" className="flex-1 flex flex-col">
        <TabsList className="w-fit mx-6 mt-4">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Financials
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Ask AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1 p-6">
          <DataRoomDashboard agentUrl={agentUrl ?? ""} slug={slug ?? ""} authQuery={authQuery} />
        </TabsContent>

        <TabsContent value="chat" className="flex-1 p-6">
          <DataRoomChat
            agentUrl={agentUrl ?? ""}
            slug={slug ?? ""}
            passcode={passcode}
            email={viewerEmail}
            sessionId={sessionId}
          />
        </TabsContent>
      </Tabs>
    </DataRoomLayout>
  );
}
