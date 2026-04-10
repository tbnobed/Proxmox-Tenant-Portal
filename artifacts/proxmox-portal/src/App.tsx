import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function Router() {
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

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
