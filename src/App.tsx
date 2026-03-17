import { Component, useEffect, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Sentry } from "@/lib/sentry";
import { posthog } from "@/lib/posthog";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import EAWorkspace from "@/pages/EAWorkspace";
import FinanceWorkspace from "@/pages/FinanceWorkspace";
import OperationsWorkspace from "@/pages/OperationsWorkspace";
import MarketingWorkspace from "@/pages/MarketingWorkspace";
import ComplianceWorkspace from "@/pages/ComplianceWorkspace";
import LegalWorkspace from "@/pages/LegalWorkspace";
import SalesWorkspace from "@/pages/SalesWorkspace";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function PostHogPageView() {
  const location = useLocation();
  useEffect(() => {
    posthog.capture('$pageview', { $current_url: `${window.location.origin}${location.pathname}${location.search}` });
  }, [location.pathname, location.search]);
  return null;
}

/** Fallback error boundary when Sentry.ErrorBoundary is unavailable */
class FallbackErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("React error boundary caught:", error, info); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

const SentryErrorBoundary = Sentry.ErrorBoundary ?? FallbackErrorBoundary;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <OfflineIndicator />
        <Toaster />
        <Sonner />
        <SentryErrorBoundary fallback={<div className="flex items-center justify-center h-screen text-destructive">Something went wrong. Please refresh the page.</div>}>
          <BrowserRouter>
            <PostHogPageView />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="ea" element={<EAWorkspace />} />
                <Route path="finance" element={<FinanceWorkspace />} />
                <Route path="operations" element={<OperationsWorkspace />} />
                <Route path="marketing" element={<MarketingWorkspace />} />
                <Route path="compliance" element={<ComplianceWorkspace />} />
                <Route path="legal" element={<LegalWorkspace />} />
                <Route path="sales" element={<SalesWorkspace />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SentryErrorBoundary>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
