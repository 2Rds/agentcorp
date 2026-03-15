import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useModelSheet } from "@/hooks/useModelSheet";
import TemplateSelector from "@/components/model/TemplateSelector";
import ModelGrid from "@/components/model/ModelGrid";
import AddRowDialog from "@/components/model/AddRowDialog";
import { useFinancialModel } from "@/hooks/useFinancialModel";
import { useModelMutations } from "@/hooks/useModelMutations";
import ScenarioToggle from "@/components/dashboard/ScenarioToggle";
import type { ModelTemplate } from "@/components/model/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalLink, FileSpreadsheet, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_TABS = [
  { value: "all", label: "All" },
  { value: "revenue", label: "Revenue" },
  { value: "cogs", label: "COGS" },
  { value: "opex", label: "OpEx" },
  { value: "headcount", label: "Headcount" },
  { value: "funding", label: "Funding" },
];

export default function FinancialModelTab() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { sheet, loading: sheetLoading, createSheet, uploadXlsx, deleteSheet } = useModelSheet(orgId);
  const [scenario, setScenario] = useState("base");
  const [activeTab, setActiveTab] = useState("all");
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState<"sheet" | "grid">("sheet");

  const { data: rows, isLoading: dataLoading } = useFinancialModel(orgId, scenario);
  const { upsertRow, addRows } = useModelMutations(orgId, scenario);

  const hasData = (rows ?? []).length > 0;
  const months = [...new Set((rows ?? []).map((r) => r.month))].sort();

  const handleTemplateSelect = async (template: ModelTemplate) => {
    setIsCreating(true);
    const result = await createSheet(template.googleSheetId, template.name);
    if (!result.ok) {
      toast({ title: "Failed to create sheet", description: result.error, variant: "destructive" });
    }
    setIsCreating(false);
  };

  const handleXlsxUpload = async (file: File) => {
    setIsUploading(true);
    const result = await uploadXlsx(file);
    if (!result.ok) {
      toast({ title: "Failed to upload spreadsheet", description: result.error, variant: "destructive" });
    }
    setIsUploading(false);
  };

  if (sheetLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  if (!sheet) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-6">Financial Model</h2>
        <TemplateSelector
          onSelect={handleTemplateSelect}
          onUploadXlsx={handleXlsxUpload}
          isCreating={isCreating}
          isUploading={isUploading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Financial Model</h2>
          <Badge variant="secondary" className="text-xs gap-1">
            <FileSpreadsheet className="w-3 h-3" />
            {sheet.templateName}
          </Badge>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.open(sheet.url, "_blank")}>
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Google Sheets
        </Button>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "sheet" | "grid")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="sheet" className="text-xs gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Google Sheet
            </TabsTrigger>
            <TabsTrigger value="grid" className="text-xs gap-1.5">
              Supabase Data
            </TabsTrigger>
          </TabsList>
          {viewMode === "grid" && <ScenarioToggle value={scenario} onChange={setScenario} />}
        </div>

        <TabsContent value="sheet" className="mt-3">
          <Card className="border-border/50 overflow-hidden">
            <iframe
              src={`${sheet.url}?widget=true&headers=false`}
              className="w-full border-0"
              style={{ height: "calc(100vh - 300px)", minHeight: "500px" }}
              title="Financial Model — Google Sheets"
              allowFullScreen
            />
          </Card>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">
              All formulas are live in Google Sheets. Ask your CFO agent to populate assumptions.
            </p>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={deleteSheet}>
              <RotateCcw className="w-3 h-3" />
              Reset Template
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="grid" className="mt-3">
          {dataLoading ? (
            <Skeleton className="h-[400px] w-full rounded-xl" />
          ) : !hasData ? (
            <Card className="p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No data in Supabase yet. The agent will sync financial data here when it populates your Google Sheet model.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    {CATEGORY_TABS.map((tab) => (
                      <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {orgId && (
                  <AddRowDialog
                    orgId={orgId}
                    scenario={scenario}
                    months={months}
                    onAdd={(newRows) => addRows.mutate(newRows)}
                    isPending={addRows.isPending}
                  />
                )}
              </div>
              <Card className="border-border/50">
                <ModelGrid
                  rows={rows ?? []}
                  activeCategory={activeTab}
                  onCellSave={(id, amount) => upsertRow.mutate({ id, amount })}
                />
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
