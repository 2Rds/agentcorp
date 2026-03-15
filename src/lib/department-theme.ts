export interface DepartmentTheme {
  gradient: string;
  bg: string;
  bgAlpha: string;
  text: string;
  border: string;
  shadow: string;
  hoverShadow: string;
  borderLeft: string;
  spinnerBorder: string;
  ring: string;
  glowBg: string;
  iconBg: string;
}

const themes: Record<string, DepartmentTheme> = {
  ea: {
    gradient: "from-agent-ea to-agent-ea-to",
    bg: "bg-agent-ea",
    bgAlpha: "bg-agent-ea/10",
    text: "text-agent-ea",
    border: "border-agent-ea/30",
    shadow: "shadow-glow-ea",
    hoverShadow: "hover:shadow-glow-ea",
    borderLeft: "border-l-agent-ea",
    spinnerBorder: "border-t-agent-ea",
    ring: "ring-agent-ea/40",
    glowBg: "hsl(217 91% 30% / 0.1)",
    iconBg: "bg-agent-ea/15",
  },
  finance: {
    gradient: "from-agent-finance to-agent-finance-to",
    bg: "bg-agent-finance",
    bgAlpha: "bg-agent-finance/10",
    text: "text-agent-finance",
    border: "border-agent-finance/30",
    shadow: "shadow-glow-finance",
    hoverShadow: "hover:shadow-glow-finance",
    borderLeft: "border-l-agent-finance",
    spinnerBorder: "border-t-agent-finance",
    ring: "ring-agent-finance/40",
    glowBg: "hsl(160 84% 30% / 0.1)",
    iconBg: "bg-agent-finance/15",
  },
  operations: {
    gradient: "from-agent-operations to-agent-operations-to",
    bg: "bg-agent-operations",
    bgAlpha: "bg-agent-operations/10",
    text: "text-agent-operations",
    border: "border-agent-operations/30",
    shadow: "shadow-glow-operations",
    hoverShadow: "hover:shadow-glow-operations",
    borderLeft: "border-l-agent-operations",
    spinnerBorder: "border-t-agent-operations",
    ring: "ring-agent-operations/40",
    glowBg: "hsl(38 92% 40% / 0.1)",
    iconBg: "bg-agent-operations/15",
  },
  marketing: {
    gradient: "from-agent-marketing to-agent-marketing-to",
    bg: "bg-agent-marketing",
    bgAlpha: "bg-agent-marketing/10",
    text: "text-agent-marketing",
    border: "border-agent-marketing/30",
    shadow: "shadow-glow-marketing",
    hoverShadow: "hover:shadow-glow-marketing",
    borderLeft: "border-l-agent-marketing",
    spinnerBorder: "border-t-agent-marketing",
    ring: "ring-agent-marketing/40",
    glowBg: "hsl(270 67% 40% / 0.1)",
    iconBg: "bg-agent-marketing/15",
  },
  compliance: {
    gradient: "from-agent-compliance to-agent-compliance-to",
    bg: "bg-agent-compliance",
    bgAlpha: "bg-agent-compliance/10",
    text: "text-agent-compliance",
    border: "border-agent-compliance/30",
    shadow: "shadow-glow-compliance",
    hoverShadow: "hover:shadow-glow-compliance",
    borderLeft: "border-l-agent-compliance",
    spinnerBorder: "border-t-agent-compliance",
    ring: "ring-agent-compliance/40",
    glowBg: "hsl(0 72% 40% / 0.1)",
    iconBg: "bg-agent-compliance/15",
  },
  legal: {
    gradient: "from-agent-legal to-agent-legal-to",
    bg: "bg-agent-legal",
    bgAlpha: "bg-agent-legal/10",
    text: "text-agent-legal",
    border: "border-agent-legal/30",
    shadow: "shadow-glow-legal",
    hoverShadow: "hover:shadow-glow-legal",
    borderLeft: "border-l-agent-legal",
    spinnerBorder: "border-t-agent-legal",
    ring: "ring-agent-legal/40",
    glowBg: "hsl(215 20% 40% / 0.1)",
    iconBg: "bg-agent-legal/15",
  },
  sales: {
    gradient: "from-agent-sales to-agent-sales-to",
    bg: "bg-agent-sales",
    bgAlpha: "bg-agent-sales/10",
    text: "text-agent-sales",
    border: "border-agent-sales/30",
    shadow: "shadow-glow-sales",
    hoverShadow: "hover:shadow-glow-sales",
    borderLeft: "border-l-agent-sales",
    spinnerBorder: "border-t-agent-sales",
    ring: "ring-agent-sales/40",
    glowBg: "hsl(25 95% 40% / 0.1)",
    iconBg: "bg-agent-sales/15",
  },
};

export function getDeptTheme(department: string): DepartmentTheme {
  return themes[department] ?? themes.ea;
}

export const DEPARTMENT_THEMES = themes;
