import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Link2, Unlink, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IntegrationStatus, SyncResultData } from "@/hooks/useIntegrations";

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  authType: "oauth2" | "api_key";
  color: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Import your Profit & Loss report from QuickBooks, broken down by month.",
    authType: "oauth2",
    color: "bg-green-500/10 text-green-600",
  },
  {
    id: "xero",
    name: "Xero",
    description: "Import your Profit & Loss report from Xero, broken down by month.",
    authType: "oauth2",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    id: "mercury",
    name: "Mercury",
    description: "Import banking transactions from Mercury, categorized by type.",
    authType: "api_key",
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Import revenue, processing fees, and compute MRR from Stripe subscriptions.",
    authType: "oauth2",
    color: "bg-indigo-500/10 text-indigo-600",
  },
];

interface Props {
  integrations: Record<string, IntegrationStatus>;
  onConnectOAuth: (provider: string) => Promise<ActionResult>;
  onConnectApiKey: (provider: string, apiKey: string) => Promise<ActionResult>;
  onDisconnect: (provider: string) => Promise<ActionResult>;
  onSync: (provider: string) => Promise<ActionResult & { result?: SyncResultData }>;
}

export function IntegrationsTab({ integrations, onConnectOAuth, onConnectApiKey, onDisconnect, onSync }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Financial Integrations</h3>
        <p className="text-xs text-muted-foreground">
          Connect your accounting and banking systems to automatically import financial data into your model.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            status={integrations[provider.id]}
            onConnectOAuth={onConnectOAuth}
            onConnectApiKey={onConnectApiKey}
            onDisconnect={onDisconnect}
            onSync={onSync}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  status,
  onConnectOAuth,
  onConnectApiKey,
  onDisconnect,
  onSync,
}: {
  provider: ProviderMeta;
  status?: IntegrationStatus;
  onConnectOAuth: Props["onConnectOAuth"];
  onConnectApiKey: Props["onConnectApiKey"];
  onDisconnect: Props["onDisconnect"];
  onSync: Props["onSync"];
}) {
  const { toast } = useToast();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  const isConnected = status?.connected === true;

  const handleConnect = async () => {
    setBusy("connect");
    const result = await onConnectOAuth(provider.id);
    if (!result.ok) {
      toast({ title: "Connection failed", description: result.error, variant: "destructive" });
    }
    setBusy(null);
  };

  const handleApiKeySubmit = async () => {
    if (!apiKeyInput.trim()) return;
    setBusy("connect");
    const result = await onConnectApiKey(provider.id, apiKeyInput.trim());
    if (result.ok) {
      toast({ title: `${provider.name} connected` });
      setApiKeyInput("");
      setShowApiKey(false);
    } else {
      toast({ title: "Connection failed", description: result.error, variant: "destructive" });
    }
    setBusy(null);
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    const result = await onDisconnect(provider.id);
    if (result.ok) {
      toast({ title: `${provider.name} disconnected` });
    } else {
      toast({ title: "Disconnect failed", description: result.error, variant: "destructive" });
    }
    setBusy(null);
  };

  const handleSync = async () => {
    setBusy("sync");
    const result = await onSync(provider.id);
    if (result.ok) {
      toast({
        title: "Sync complete",
        description: `Imported ${result.result?.rowsImported ?? 0} rows from ${provider.name}`,
      });
    } else {
      toast({ title: "Sync failed", description: result.error, variant: "destructive" });
    }
    setBusy(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${provider.color}`}>
              <Key className="w-4 h-4" />
            </div>
            <CardTitle className="text-sm">{provider.name}</CardTitle>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px]">
            {isConnected ? "Connected" : status?.status === "expired" ? "Expired" : "Not Connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{provider.description}</p>

        {status?.lastSyncedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
          </p>
        )}

        {status?.syncError && (
          <p className="text-[10px] text-destructive">
            Error: {status.syncError}
          </p>
        )}

        {/* API Key input for api_key providers when not connected */}
        {provider.authType === "api_key" && !isConnected && (
          <div className="space-y-2">
            {showApiKey ? (
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Paste your API key..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="text-xs h-8"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!apiKeyInput.trim() || busy === "connect"}
                  onClick={handleApiKeySubmit}
                >
                  {busy === "connect" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={() => setShowApiKey(true)}
              >
                <Key className="w-3 h-3" />
                Enter API Key
              </Button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs gap-1.5"
                onClick={handleSync}
                disabled={busy !== null}
              >
                {busy === "sync" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Sync Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5 text-muted-foreground"
                onClick={handleDisconnect}
                disabled={busy !== null}
              >
                {busy === "disconnect" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Unlink className="w-3 h-3" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            provider.authType === "oauth2" && (
              <Button
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={handleConnect}
                disabled={busy !== null}
              >
                {busy === "connect" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Link2 className="w-3 h-3" />
                )}
                Connect {provider.name}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
