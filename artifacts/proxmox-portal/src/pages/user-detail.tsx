import { useParams, Link } from "wouter";
import { useGetUser, useListUserVmAccess } from "@workspace/api-client-react";
import { ArrowLeft, Monitor, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", className)}>
      {label}
    </span>
  );
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: user, isLoading } = useGetUser(id, { query: { enabled: !!id } });
  const { data: allUserVmAccess } = useListUserVmAccess();

  const userAccess = allUserVmAccess?.filter(a => a.userId === id) ?? [];

  const roleColors: Record<string, string> = {
    admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    operator: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    viewer: "bg-muted text-muted-foreground border-border",
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    inactive: "bg-muted text-muted-foreground border-border",
    suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/users" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">{user?.fullName ?? user?.username}</h1>
              {user && <Badge label={user.role} className={roleColors[user.role] ?? ""} />}
              {user && <Badge label={user.status} className={statusColors[user.status] ?? ""} />}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        )}
      </div>

      {/* Info */}
      {user && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Username</p>
            <p className="text-sm font-medium text-foreground mt-1">{user.username}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Tenant</p>
            {user.tenantId ? (
              <Link href={`/tenants/${user.tenantId}`} className="text-sm font-medium text-primary hover:underline mt-1 block">
                {user.tenantName}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">None</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">VM Access</p>
            <p className="text-sm font-medium text-foreground mt-1">{user.vmCount} VMs</p>
          </div>
        </div>
      )}

      {/* VM Access */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Monitor className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">VM Access</h2>
          <span className="text-xs text-muted-foreground ml-auto">{userAccess.length}</span>
        </div>
        {userAccess.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No VMs assigned to this user</p>
        ) : (
          <div className="divide-y divide-border">
            {userAccess.map(a => (
              <Link key={a.id} href={`/vms/${a.vmId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.vmName}</p>
                  <p className="text-xs text-muted-foreground">Granted {new Date(a.grantedAt).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
