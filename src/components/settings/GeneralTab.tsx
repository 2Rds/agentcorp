import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Shield } from "lucide-react";

interface Props {
  orgName?: string;
  memberCount?: number;
  userRole?: string;
}

export function GeneralTab({ orgName, memberCount, userRole }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Organization</h3>
        <p className="text-xs text-muted-foreground">
          Your organization details and membership.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Organization Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{orgName || "—"}</p>
              <p className="text-xs text-muted-foreground">Organization name</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              {memberCount ?? "—"} member{memberCount !== 1 ? "s" : ""}
            </div>
            {userRole && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5" />
                <Badge variant="secondary" className="text-[10px]">
                  {userRole}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
