import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Settings, Building2, Plug } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useToast } from "@/hooks/use-toast";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";

export default function SettingsPage() {
  const { orgId } = useOrganization();
  const { activeOrganization } = useAuthContext();
  const { integrations, loading, connectOAuth, connectApiKey, disconnect, sync } = useIntegrations(orgId);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Capture initial tab before useEffect clears the params
  const [defaultTab] = useState(() =>
    searchParams.get("integration") ? "integrations" : "general"
  );

  // Handle OAuth callback result from URL params
  useEffect(() => {
    const integration = searchParams.get("integration");
    const status = searchParams.get("status");
    const message = searchParams.get("message");

    if (integration && status) {
      if (status === "connected") {
        toast({ title: `${capitalize(integration)} connected successfully` });
      } else if (status === "error") {
        toast({
          title: `${capitalize(integration)} connection failed`,
          description: message || "Unknown error",
          variant: "destructive",
        });
      }
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">
              Manage your organization and integrations
            </p>
          </div>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="general" className="text-xs gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs gap-1.5">
              <Plug className="w-3.5 h-3.5" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <GeneralTab
              orgName={activeOrganization?.name}
              userRole={activeOrganization?.role}
            />
          </TabsContent>

          <TabsContent value="integrations" className="mt-4">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : (
              <IntegrationsTab
                integrations={integrations}
                onConnectOAuth={connectOAuth}
                onConnectApiKey={connectApiKey}
                onDisconnect={disconnect}
                onSync={sync}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
