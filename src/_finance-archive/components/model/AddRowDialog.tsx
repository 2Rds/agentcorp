import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

const CATEGORIES = ["revenue", "cogs", "opex", "headcount", "funding"] as const;

interface AddRowDialogProps {
  orgId: string;
  scenario: string;
  months: string[];
  onAdd: (rows: { organization_id: string; category: string; subcategory: string; month: string; amount: number; scenario: string }[]) => void;
  isPending: boolean;
}

export default function AddRowDialog({ orgId, scenario, months, onAdd, isPending }: AddRowDialogProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("revenue");
  const [subcategory, setSubcategory] = useState("");

  const handleSubmit = () => {
    if (!subcategory.trim()) return;
    const targetMonths = months.length > 0 ? months : generateDefaultMonths();
    const rows = targetMonths.map((month) => ({
      organization_id: orgId,
      category,
      subcategory: subcategory.trim(),
      month,
      amount: 0,
      scenario,
    }));
    onAdd(rows);
    setSubcategory("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
          <DialogDescription>
            Add a new row to your financial model. It will be created with $0 for each month.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c === "cogs" ? "COGS" : c === "opex" ? "OpEx" : c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Subcategory</label>
            <Input
              placeholder="e.g. AWS Hosting"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!subcategory.trim() || isPending}>
            {isPending ? "Adding..." : "Add Row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generateDefaultMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}
