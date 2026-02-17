import {
  Repeat,
  CalendarClock,
  BarChart3,
  CalendarRange,
  Store,
  ShoppingCart,
  Receipt,
  Clock,
  Users,
  FileText,
  CalendarCheck,
  Package,
  type LucideIcon,
} from "lucide-react";

export interface ModelTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Google Sheet ID of the master template (user gets a copy). Set after uploading to Google Sheets. */
  googleSheetId: string;
  /** Filename in public/templates/ for fallback download */
  fileName: string;
}

/**
 * All 12 BlockDrive financial model templates.
 *
 * Each template is a complete Excel workbook with 3 sheets (Overview, Assumptions, Financials)
 * containing 180+ interconnected formula cells. The actual formulas live in the Google Sheet /
 * .xlsx file — NOT in this config. This config is metadata for the template selector UI.
 *
 * To set up Google Sheets integration:
 * 1. Upload each .xlsx from public/templates/ to Google Sheets (via a service account)
 * 2. Copy the spreadsheet ID from the URL
 * 3. Paste it into the googleSheetId field below
 */
export const MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: "monthly-saas",
    name: "Monthly SaaS",
    description: "Recurring monthly revenue tracking with MRR, churn, and 3 subscription tiers. 10 customer acquisition channels with conversion funnels.",
    icon: Repeat,
    googleSheetId: "1wrgilz8Nwu_daeG3Wc7Pfh0hEO0_c70PhnwQd4HR0DQ",
    fileName: "1. Monthly SaaS Template.xlsx",
  },
  {
    id: "annual-saas",
    name: "Annual SaaS",
    description: "Yearly billing cycles with annual churn, renewal tracking, deferred revenue, and bookings vs. recognized revenue.",
    icon: CalendarClock,
    googleSheetId: "15-mS5YYm7aXx7jM6KmOsFW8gzqKDmfjgf447lmqydoE",
    fileName: "2. Annual SaaS Template.xlsx",
  },
  {
    id: "per-unit-monthly-saas",
    name: "Per Unit Monthly SaaS",
    description: "Monthly subscription with per-unit metrics. Tracks average units per subscription, total purchases, and unit-level pricing.",
    icon: BarChart3,
    googleSheetId: "1CNX0B3iDrlNMneWibc6L06ga-xMvPAR1SuEwwEK6Or0",
    fileName: "3. Per Unit Monthly SaaS Template.xlsx",
  },
  {
    id: "per-unit-annual-saas",
    name: "Per Unit Annual SaaS",
    description: "Annual billing with granular unit-level metrics. Tracks per-student or per-seat pricing with license tiers.",
    icon: CalendarRange,
    googleSheetId: "1EFbu85_9byUpdtMkiZ66mIZlowD8HePcvZFN0YDMTS0",
    fileName: "4. Per Unit Annual SaaS Template.xlsx",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Multi-party transactions with take rate, GMV tracking, returning customer rate, and average transaction size.",
    icon: Store,
    googleSheetId: "10JpucpUcysVJzmmTUmVeDX9LkRBbCh5J_rq3I6WARfI",
    fileName: "5. Marketplace Template.xlsx",
  },
  {
    id: "ecommerce",
    name: "Ecommerce",
    description: "Product-based revenue with AOV, returning customers, inventory days on hand, and product cost tracking.",
    icon: ShoppingCart,
    googleSheetId: "1It5sREIYtXkirMvpmxDVvEn4olyXaN_deC9bdf5zGyA",
    fileName: "6. E-Commerce Template.xlsx",
  },
  {
    id: "transactional",
    name: "Transactional",
    description: "Transaction-based revenue with take rates, average transaction size, and customer frequency metrics.",
    icon: Receipt,
    googleSheetId: "1dlQ6xZQs3Hpb8PcoOQGwWXYX5N4BTxoJyEQ-xd_6ITY",
    fileName: "7. Transactional Template.xlsx",
  },
  {
    id: "hourly-services",
    name: "Hourly Services",
    description: "Time-based service revenue with average monthly hours billed per customer and hourly rate tracking.",
    icon: Clock,
    googleSheetId: "1M906Z2drwEg5I8pH-QQQaiCirHxOQ1RSIbkZZYjjS9c",
    fileName: "8. Hourly Services Template.xlsx",
  },
  {
    id: "user-application",
    name: "User Application",
    description: "User acquisition and engagement model with MAU, transactions per active user, freemium/premium conversion, and take rate.",
    icon: Users,
    googleSheetId: "15G4ZacU_FBg54mKa5N2kl1HYheGaARfGumt1zvEZ1mU",
    fileName: "9. User Application Template.xlsx",
  },
  {
    id: "custom-contracts",
    name: "Custom Contracts",
    description: "Variable deal-specific revenue with 6 contract slots. No customer acquisition channels — purely pipeline-driven.",
    icon: FileText,
    googleSheetId: "17JqscFQe8DZkR0Vnzn-cJ1IfSbqJuPAymCEaIXz2VXI",
    fileName: "10. Custom Contracts Template.xlsx",
  },
  {
    id: "annual-saas-monthly-billing",
    name: "Annual SaaS Monthly Billing",
    description: "Annual commitments with monthly payment schedules, onboarding fees, cross-tier upgrades, and deferred revenue.",
    icon: CalendarCheck,
    googleSheetId: "1dOxyHKuvWJkfe6i73LQEWnKbhLCNYNrlgAK2OGsqy4A",
    fileName: "11. Annual SaaS Template - Monthly Billing.xlsx",
  },
  {
    id: "cpg",
    name: "CPG",
    description: "Consumer packaged goods with product purchases, monthly subscriptions, product cost, and inventory tracking.",
    icon: Package,
    googleSheetId: "187748aHduQ3c55n1xAK4qhG2D1zbO7SVuJKQ9m8GDKI",
    fileName: "12. CPG Template.xlsx",
  },
];
