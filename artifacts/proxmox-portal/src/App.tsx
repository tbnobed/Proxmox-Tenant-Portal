import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/login";
import { useEffect } from "react";
import DashboardPage from "@/pages/dashboard";
import ClustersPage from "@/pages/clusters";
import ClusterDetailPage from "@/pages/cluster-detail";
import TenantsPage from "@/pages/tenants";
import TenantDetailPage from "@/pages/tenant-detail";
import UsersPage from "@/pages/users";
import UserDetailPage from "@/pages/user-detail";
import VmsPage from "@/pages/vms";
import VmDetailPage from "@/pages/vm-detail";
import AccessPage from "@/pages/access";
import VmConsolePage from "@/pages/vm-console";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function AppRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/clusters" component={ClustersPage} />
        <Route path="/clusters/:id" component={ClusterDetailPage} />
        <Route path="/tenants" component={TenantsPage} />
        <Route path="/tenants/:id" component={TenantDetailPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/users/:id" component={UserDetailPage} />
        <Route path="/vms" component={VmsPage} />
        <Route path="/vms/:id" component={VmDetailPage} />
        <Route path="/vms/:id/console" component={VmConsolePage} />
        <Route path="/access" component={AccessPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AuthGate() {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={refresh} />;
  }

  return <AppRouter />;
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
