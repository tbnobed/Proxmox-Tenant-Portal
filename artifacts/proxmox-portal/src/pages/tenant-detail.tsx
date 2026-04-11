import { useParams, Link } from "wouter";
import { useGetTenant, useGetTenantSummary, useListUsers, useListTenantVmAccess, useListVms } from "@workspace/api-client-react";
import { ArrowLeft, Users, Monitor, ShieldCheck, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-olive/20 text-sand border-olive/30",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-navy/40 text-sand border-navy/50",
    active: "bg-olive/20 text-sand border-olive/30",
    inactive: "bg-muted text-muted-foreground border-border",
    admin: "bg-olive/15 text-sand border-olive/20",
    operator: "bg-navy/40 text-sand border-navy/50",
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
  const { data: vms } = useListVms();

  const tenantUsers = allUsers?.filter(u => u.tenantId === id) ?? [];
  const accessGrants = tenantVmAccess?.filter(a => a.tenantId === id) ?? [];

  const vmMap = useMemo(() => {
    if (!vms) return new Map();
    return new Map(vms.map(v => [v.id, v]));
  }, [vms]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tenants" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-forest/40 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-sand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">{tenant?.name}</h1>
                {tenant?.status && <StatusBadge status={tenant.status} />}
              </div>
              {tenant?.description && <p className="text-sm text-muted-foreground mt-0.5">{tenant.description}</p>}
              {tenant?.contactEmail && <p className="text-xs text-muted-foreground mt-0.5">{tenant.contactEmail}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Accessible VMs</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalVms ?? accessGrants.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold text-olive mt-1">{summary?.runningVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Stopped</p>
          <p className="text-2xl font-bold text-muted-foreground mt-1">{summary?.stoppedVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Users</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalUsers ?? tenantUsers.length}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Users className="w-4 h-4 text-sand" />
            <h2 className="text-sm font-semibold text-foreground">Users</h2>
            <span className="text-xs text-muted-foreground ml-auto">{tenantUsers.length}</span>
          </div>
          {tenantUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No users in this tenant</p>
          ) : (
            <div className="divide-y divide-border">
              {tenantUsers.map(u => (
                <Link key={u.id} href={`/users/${u.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.fullName ?? u.username}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <StatusBadge status={u.role} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <ShieldCheck className="w-4 h-4 text-sand" />
            <h2 className="text-sm font-semibold text-foreground">Accessible VMs</h2>
            <span className="text-xs text-muted-foreground ml-auto">{accessGrants.length}</span>
          </div>
          {accessGrants.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No VM access granted</p>
              <Link href="/access" className="text-xs text-sand hover:underline mt-1 inline-block">Grant access</Link>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {accessGrants.map(grant => {
                  const vm = vmMap.get(grant.vmId);
                  return (
                    <Link key={grant.id} href={vm ? `/vms/${vm.id}` : "#"} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <Monitor className="w-3.5 h-3.5 text-sand/60 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{grant.vmName}</p>
                          {vm && <p className="text-xs text-muted-foreground">{vm.clusterName} — Node: {vm.node}</p>}
                        </div>
                      </div>
                      {vm ? (
                        <StatusBadge status={vm.status} />
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded border bg-olive/10 text-sand/80 border-olive/20">granted</span>
                      )}
                    </Link>
                  );
                })}
              </div>
              <div className="px-4 py-2 border-t border-border">
                <Link href="/access" className="text-xs text-sand hover:underline">Manage access grants</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
