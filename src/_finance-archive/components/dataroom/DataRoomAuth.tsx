import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Mail } from "lucide-react";

interface DataRoomAuthProps {
  companyName: string;
  requireEmail: boolean;
  hasPasscode: boolean;
  onAuth: (email: string, passcode: string) => Promise<void>;
}

export function DataRoomAuth({ companyName, requireEmail, hasPasscode, onAuth }: DataRoomAuthProps) {
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onAuth(email, passcode);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{companyName} Data Room</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {requireEmail && hasPasscode
              ? "Enter your email and passcode to access"
              : requireEmail
              ? "Enter your email to access"
              : "Enter the passcode to access"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {requireEmail && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" required />
                </div>
              </div>
            )}
            {hasPasscode && (
              <div className="space-y-2">
                <Label htmlFor="passcode">Passcode</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="passcode" type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Enter passcode" className="pl-10" required />
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : "Access Data Room"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
