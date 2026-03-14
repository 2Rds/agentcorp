import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ScenarioToggleProps {
  value: string;
  onChange: (val: string) => void;
}

export default function ScenarioToggle({ value, onChange }: ScenarioToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="bg-muted rounded-lg p-0.5"
    >
      <ToggleGroupItem value="best" className="text-xs px-3 py-1 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm">
        Best
      </ToggleGroupItem>
      <ToggleGroupItem value="base" className="text-xs px-3 py-1 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm">
        Base
      </ToggleGroupItem>
      <ToggleGroupItem value="worst" className="text-xs px-3 py-1 rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm">
        Worst
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
