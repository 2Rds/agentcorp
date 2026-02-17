import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EditableCell from "./EditableCell";
import type { FinancialModelRow } from "@/hooks/useFinancialModel";

const CATEGORY_COLORS: Record<string, string> = {
  revenue: "border-l-emerald-500",
  cogs: "border-l-red-500",
  opex: "border-l-amber-500",
  headcount: "border-l-blue-500",
  funding: "border-l-purple-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cogs: "COGS",
  opex: "Operating Expenses",
  headcount: "Headcount",
  funding: "Funding",
};

export function formatMonth(m: string): string {
  const d = new Date(m + "-01");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function formatSummary(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

interface ModelGridProps {
  rows: FinancialModelRow[];
  activeCategory: string;
  onCellSave: (id: string, amount: number) => void;
}

interface GroupedRow {
  subcategory: string;
  cells: Map<string, FinancialModelRow>;
}

interface CategoryGroup {
  category: string;
  rows: GroupedRow[];
}

export default function ModelGrid({ rows, activeCategory, onCellSave }: ModelGridProps) {
  const months = useMemo(() => {
    const set = new Set(rows.map((r) => r.month));
    return Array.from(set).sort();
  }, [rows]);

  const groups = useMemo(() => {
    const filtered =
      activeCategory === "all"
        ? rows
        : rows.filter((r) => r.category === activeCategory);

    const categoryOrder = ["revenue", "cogs", "opex", "headcount", "funding"];
    const byCategory = new Map<string, Map<string, Map<string, FinancialModelRow>>>();

    for (const r of filtered) {
      if (!byCategory.has(r.category)) byCategory.set(r.category, new Map());
      const catMap = byCategory.get(r.category)!;
      if (!catMap.has(r.subcategory)) catMap.set(r.subcategory, new Map());
      catMap.get(r.subcategory)!.set(r.month, r);
    }

    const result: CategoryGroup[] = [];
    for (const cat of categoryOrder) {
      const catMap = byCategory.get(cat);
      if (!catMap) continue;
      const groupRows: GroupedRow[] = [];
      for (const [sub, cells] of catMap) {
        groupRows.push({ subcategory: sub, cells });
      }
      result.push({ category: cat, rows: groupRows });
    }
    return result;
  }, [rows, activeCategory]);

  const summaries = useMemo(() => {
    const grossProfit = new Map<string, number>();
    const totalOpex = new Map<string, number>();
    const ebitda = new Map<string, number>();

    for (const m of months) {
      let rev = 0, cogs = 0, opex = 0, hc = 0;
      for (const r of rows) {
        if (r.month !== m) continue;
        if (r.category === "revenue") rev += r.amount;
        else if (r.category === "cogs") cogs += r.amount;
        else if (r.category === "opex") opex += r.amount;
        else if (r.category === "headcount") hc += r.amount;
      }
      grossProfit.set(m, rev - cogs);
      totalOpex.set(m, opex + hc);
      ebitda.set(m, rev - cogs - opex - hc);
    }
    return { grossProfit, totalOpex, ebitda };
  }, [rows, months]);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No line items in this category yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-card min-w-[200px] border-r">
              Line Item
            </TableHead>
            {months.map((m) => (
              <TableHead key={m} className="text-right text-xs w-28 min-w-[112px]">
                {formatMonth(m)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <CategorySection
              key={group.category}
              group={group}
              months={months}
              onCellSave={onCellSave}
            />
          ))}
        </TableBody>
        {activeCategory === "all" && (
          <TableFooter>
            <SummaryRow label="Gross Profit" values={summaries.grossProfit} months={months} />
            <SummaryRow label="Total OpEx" values={summaries.totalOpex} months={months} />
            <SummaryRow label="EBITDA" values={summaries.ebitda} months={months} />
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

function CategorySection({
  group,
  months,
  onCellSave,
}: {
  group: CategoryGroup;
  months: string[];
  onCellSave: (id: string, amount: number) => void;
}) {
  const subtotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of months) {
      let total = 0;
      for (const row of group.rows) {
        total += row.cells.get(m)?.amount ?? 0;
      }
      map.set(m, total);
    }
    return map;
  }, [group, months]);

  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={months.length + 1}
          className={cn(
            "bg-muted/30 font-semibold text-xs uppercase tracking-wider py-2 border-l-2",
            CATEGORY_COLORS[group.category]
          )}
        >
          {CATEGORY_LABELS[group.category] ?? group.category}
        </TableCell>
      </TableRow>
      {group.rows.map((row) => (
        <TableRow key={row.subcategory}>
          <TableCell
            className={cn(
              "sticky left-0 z-10 bg-card text-sm font-medium border-r border-l-2",
              CATEGORY_COLORS[group.category]
            )}
          >
            {row.subcategory}
          </TableCell>
          {months.map((m) => {
            const cell = row.cells.get(m);
            return (
              <TableCell key={m} className="p-0">
                {cell ? (
                  <EditableCell
                    value={cell.amount}
                    formula={cell.formula}
                    onSave={(val) => onCellSave(cell.id, val)}
                  />
                ) : (
                  <div className="h-8 w-28 flex items-center justify-end px-2 text-sm font-mono text-muted-foreground/40">
                    --
                  </div>
                )}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
      <TableRow className="hover:bg-transparent">
        <TableCell
          className={cn(
            "sticky left-0 z-10 bg-muted/50 text-sm font-semibold italic border-r border-l-2",
            CATEGORY_COLORS[group.category]
          )}
        >
          Total {CATEGORY_LABELS[group.category] ?? group.category}
        </TableCell>
        {months.map((m) => (
          <TableCell key={m} className="bg-muted/50 p-0">
            <div
              className={cn(
                "h-8 w-28 flex items-center justify-end px-2 text-sm font-mono font-semibold italic",
                (subtotals.get(m) ?? 0) < 0 && "text-destructive"
              )}
            >
              {formatSummary(subtotals.get(m) ?? 0)}
            </div>
          </TableCell>
        ))}
      </TableRow>
    </>
  );
}

function SummaryRow({
  label,
  values,
  months,
}: {
  label: string;
  values: Map<string, number>;
  months: string[];
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="sticky left-0 z-10 bg-muted/50 font-semibold text-sm border-r">
        {label}
      </TableCell>
      {months.map((m) => {
        const v = values.get(m) ?? 0;
        return (
          <TableCell key={m} className="p-0">
            <div
              className={cn(
                "h-8 w-28 flex items-center justify-end px-2 text-sm font-mono font-semibold",
                v < 0 && "text-destructive"
              )}
            >
              {formatSummary(v)}
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
}
