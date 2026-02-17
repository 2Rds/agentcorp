import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MODEL_TEMPLATES, type ModelTemplate } from "./templates";

interface TemplateSelectorProps {
  onSelect: (template: ModelTemplate) => void;
  isCreating: boolean;
}

export default function TemplateSelector({ onSelect, isCreating }: TemplateSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 py-4">
        <h2 className="text-xl font-semibold">Choose a BlockDrive Model Template</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Select the template that best fits your business model. Your Chief Financial Agent will begin building your financial intelligence dashboard by integrating files manually uploaded to its knowledge base, connected third party databases, and personalized context based on your conversations. Your model template is directly embedded in your dashboard via Google Sheets to fully preserve the formula driven logic in every cell.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODEL_TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
            onClick={() => !isCreating && onSelect(template)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <template.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold leading-tight">
                  {template.name}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {template.description}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                disabled={isCreating}
              >
                {isCreating ? "Setting up..." : "Use This Template"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
