import { useParams, Link } from "wouter";
import { useGetTenant, useGetTenantSummary, useListUsers, useListTenantVmAccess, useListVms } from "@workspace/api-client-react";
import { ArrowLeft, Building2, Users, Monitor, Play, Square } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-green-500/10 text-green-400 border-green-500/20",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    inactive: "bg-muted text-muted-foreground border-border",
    admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    operator: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    viewer: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.active)}>
      {status}
    </span>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: tenant, isLoading } = useGetTenant(id, { query: { enabled: !!id } });
  const { data: summary } = useGetTenantSummary(id, { query: { enabled: !!id } });
  const { data: allUsers } = useListUsers();
  const { data: tenantVmAccess } = useListTenantVmAccess();
  const { data: vms } = useListVms({ params: { tenantId: id } });

  const tenantUsers = allUsers?.filter(u => u.tenantId === id) ?? [];
  const accessGrants = tenantVmAccess?.filter(a => a.tenantId === id) ?? [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tenants">
          <a className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </a>
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div>
            <h1 className="text-xl font-semibold text-foreground">{tenant?.name}</h1>
            {tenant?.description && <p className="text-sm text-muted-foreground mt-0.5">{tenant.description}</p>}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total VMs</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{summary?.runningVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Stopped</p>
          <p className="text-2xl font-bold text-muted-foreground mt-1">{summary?.stoppedVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Users</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalUsers ?? "—"}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Users */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Users</h2>
            <span className="text-xs text-muted-foreground ml-auto">{tenantUsers.length}</span>
          </div>
          {tenantUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No users in this tenant</p>
          ) : (
            <div className="divide-y divide-border">
              {tenantUsers.map(u => (
                <Link key={u.id} href={`/users/${u.id}`}>
                  <a className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.fullName ?? u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <StatusBadge status={u.role} />
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* VMs */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Monitor className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Assigned VMs</h2>
            <span className="text-xs text-muted-foreground ml-auto">{vms?.length ?? 0}</span>
          </div>
          {!vms || vms.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No VMs assigned to this tenant</p>
          ) : (
            <div className="divide-y divide-border">
              {vms.map(vm => (
                <Link key={vm.id} href={`/vms/${vm.id}`}>
                  <a className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{vm.name}</p>
                      <p className="text-xs text-muted-foreground">{vm.clusterName} — Node: {vm.node}</p>
                    </div>
                    <StatusBadge status={vm.status} />
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
