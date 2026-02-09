import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Settings className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Settings</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Configure your organization, manage team members, and set preferences.
        </p>
      </div>
    </div>
  );
}
