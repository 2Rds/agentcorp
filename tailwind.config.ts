import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          positive: "hsl(var(--chart-positive))",
          negative: "hsl(var(--chart-negative))",
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        agent: {
          ea: "hsl(var(--agent-ea))",
          "ea-to": "hsl(var(--agent-ea-to))",
          finance: "hsl(var(--agent-finance))",
          "finance-to": "hsl(var(--agent-finance-to))",
          operations: "hsl(var(--agent-operations))",
          "operations-to": "hsl(var(--agent-operations-to))",
          marketing: "hsl(var(--agent-marketing))",
          "marketing-to": "hsl(var(--agent-marketing-to))",
          compliance: "hsl(var(--agent-compliance))",
          "compliance-to": "hsl(var(--agent-compliance-to))",
          legal: "hsl(var(--agent-legal))",
          "legal-to": "hsl(var(--agent-legal-to))",
          sales: "hsl(var(--agent-sales))",
          "sales-to": "hsl(var(--agent-sales-to))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "glow-sm": "0 0 12px -3px hsl(var(--glow-blue))",
        "glow-md": "0 0 20px -5px hsl(var(--glow-blue))",
        "glow-lg": "0 4px 30px -6px hsl(var(--glow-blue))",
        "glow-xl": "0 8px 50px -6px hsl(var(--glow-blue))",
        "glow-ea": "0 2px 16px -4px hsl(var(--agent-ea) / 0.2)",
        "glow-finance": "0 2px 16px -4px hsl(var(--agent-finance) / 0.2)",
        "glow-operations": "0 2px 16px -4px hsl(var(--agent-operations) / 0.2)",
        "glow-marketing": "0 2px 16px -4px hsl(var(--agent-marketing) / 0.2)",
        "glow-compliance": "0 2px 16px -4px hsl(var(--agent-compliance) / 0.2)",
        "glow-legal": "0 2px 16px -4px hsl(var(--agent-legal) / 0.2)",
        "glow-sales": "0 2px 16px -4px hsl(var(--agent-sales) / 0.2)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        reveal: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "bounce-dot": "bounce-dot 1.4s infinite ease-in-out both",
        "fade-in": "fade-in 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "fade-in-down": "fade-in-down 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "slide-in-left": "slide-in-left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        reveal: "reveal 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        shimmer: "shimmer 2s infinite linear",
        "pulse-ring": "pulse-ring 2s infinite ease-out",
        "spin-slow": "spin-slow 3s infinite linear",
        "glow-pulse": "glow-pulse 2s infinite ease-in-out",
        float: "float 3s infinite ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
