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

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground">Access Denied</p>
          <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return <Component />;
}

function AppRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/clusters">{() => <AdminRoute component={ClustersPage} />}</Route>
        <Route path="/clusters/:id">{() => <AdminRoute component={ClusterDetailPage} />}</Route>
        <Route path="/tenants">{() => <AdminRoute component={TenantsPage} />}</Route>
        <Route path="/tenants/:id">{() => <AdminRoute component={TenantDetailPage} />}</Route>
        <Route path="/users">{() => <AdminRoute component={UsersPage} />}</Route>
        <Route path="/users/:id">{() => <AdminRoute component={UserDetailPage} />}</Route>
        <Route path="/vms" component={VmsPage} />
        <Route path="/vms/:id" component={VmDetailPage} />
        <Route path="/vms/:id/console" component={VmConsolePage} />
        <Route path="/access">{() => <AdminRoute component={AccessPage} />}</Route>
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
