import { useParams, Link } from "wouter";
import { useGetUser, useListUserVmAccess, useListUserSessions } from "@workspace/api-client-react";
import { ArrowLeft, Monitor, Building2, Clock, Globe, Smartphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", className)}>
      {label}
    </span>
  );
}

function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("curl")) return "curl";
  return "Browser";
}

function formatDuration(loginAt: string, logoutAt: string | null | undefined): string {
  if (!logoutAt) return "Active";
  const start = new Date(loginAt).getTime();
  const end = new Date(logoutAt).getTime();
  const diffMs = end - start;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "<1m";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  if (diffHr < 24) return remainMin > 0 ? `${diffHr}h ${remainMin}m` : `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h`;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: user, isLoading } = useGetUser(id, { query: { enabled: !!id } });
  const { data: allUserVmAccess } = useListUserVmAccess();
  const { data: sessions, isLoading: sessionsLoading } = useListUserSessions(id, { query: { enabled: !!id } });

  const userAccess = allUserVmAccess?.filter(a => a.userId === id) ?? [];

  const roleColors: Record<string, string> = {
    admin: "bg-olive/15 text-sand border-olive/20",
    operator: "bg-navy/40 text-sand border-navy/50",
    viewer: "bg-muted text-muted-foreground border-border",
  };

  const statusColors: Record<string, string> = {
    active: "bg-olive/20 text-sand border-olive/30",
    inactive: "bg-muted text-muted-foreground border-border",
    suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div className="space-y-6">
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

      {user && (
        <div className="grid md:grid-cols-4 gap-4">
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
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Last Login</p>
            <p className="text-sm font-medium text-foreground mt-1">{formatRelative(user.lastLoginAt)}</p>
            {user.lastLoginAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(user.lastLoginAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Session History</h2>
          <span className="text-xs text-muted-foreground ml-auto">{sessions?.length ?? 0} sessions</span>
        </div>
        {sessionsLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No login sessions recorded yet</p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-shrink-0">
                  {s.logoutAt ? (
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {new Date(s.loginAt).toLocaleString()}
                    </p>
                    {!s.logoutAt && (
                      <Badge label="Active" className="bg-green-500/10 text-green-400 border-green-500/20" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {s.ipAddress && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {s.ipAddress}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      {parseUserAgent(s.userAgent)}
                    </span>
                    <span>Duration: {formatDuration(s.loginAt, s.logoutAt)}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {formatRelative(s.loginAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
