import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkAuthProvider } from "@/contexts/ClerkAuthContext";
import { ClerkProtectedRoute } from "@/components/auth/ClerkProtectedRoute";
import { useOrganization } from "@/hooks/useOrganization";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import SignUp from "./pages/SignUp";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";
import Investors from "./pages/Investors";
import Knowledge from "./pages/Knowledge";
import SettingsPage from "./pages/SettingsPage";
import FinancialModel from "./pages/FinancialModel";
import Docs from "./pages/Docs";
import NotFound from "./pages/NotFound";
import DataRoom from "./pages/DataRoom";

const queryClient = new QueryClient();

function OrgGate() {
  const { orgId, loading } = useOrganization();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!orgId) return <Onboarding />;

  return <AppLayout />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ClerkAuthProvider>
          <Routes>
            <Route path="/dataroom/:slug" element={<DataRoom />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route
              element={
                <ClerkProtectedRoute>
                  <OrgGate />
                </ClerkProtectedRoute>
              }
            >
              <Route path="/" element={<Chat />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/model" element={<FinancialModel />} />
              <Route path="/investors" element={<Investors />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ClerkAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
