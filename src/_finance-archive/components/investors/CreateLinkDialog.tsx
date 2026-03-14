import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import { useInvestorLinks } from "@/hooks/useInvestorLinks";
import { toast } from "sonner";

export function CreateLinkDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const [enableDataRoom, setEnableDataRoom] = useState(false);
  const [expiresIn, setExpiresIn] = useState("");
  const { createLink } = useInvestorLinks();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const expires_at = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    try {
      await createLink.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        passcode: passcode.trim() || undefined,
        require_email: requireEmail,
        expires_at,
        enable_data_room: enableDataRoom,
      });
      toast.success("Share link created");
      setOpen(false);
      setName(""); setEmail(""); setPasscode(""); setRequireEmail(false); setEnableDataRoom(false); setExpiresIn("");
    } catch {
      toast.error("Failed to create link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          New Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Investor Share Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Investor / Firm Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sequoia Capital" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@sequoia.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passcode">Passcode (optional)</Label>
            <Input id="passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Leave empty for open access" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="require-email">Require email to view</Label>
            <Switch id="require-email" checked={requireEmail} onCheckedChange={setRequireEmail} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="enable-dataroom">Enable Data Room</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Live financials, cap table, and AI Q&A</p>
            </div>
            <Switch id="enable-dataroom" checked={enableDataRoom} onCheckedChange={setEnableDataRoom} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires">Expires in (days, optional)</Label>
            <Input id="expires" type="number" min="1" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} placeholder="Never" />
          </div>
          <Button type="submit" className="w-full" disabled={createLink.isPending}>
            {createLink.isPending ? "Creating..." : "Create Share Link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
