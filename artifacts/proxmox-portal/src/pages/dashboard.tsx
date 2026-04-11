import { useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { Server, Building2, Users, Monitor, Activity, Wifi, WifiOff, Play, Square } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | undefined;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-bold text-foreground">{value}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ActivityItem({ event }: { event: { id: number; eventType: string; description: string; vmName?: string | null; userName?: string | null; tenantName?: string | null; createdAt: string } }) {
  const typeColors: Record<string, string> = {
    vm_start: "bg-green-500/10 text-green-400",
    vm_stop: "bg-red-500/10 text-red-400",
    vm_reboot: "bg-yellow-500/10 text-yellow-400",
    vm_sync: "bg-blue-500/10 text-blue-400",
    tenant_created: "bg-purple-500/10 text-purple-400",
    user_created: "bg-cyan-500/10 text-cyan-400",
    access_granted: "bg-green-500/10 text-green-400",
    access_revoked: "bg-orange-500/10 text-orange-400",
  };

  const colorClass = typeColors[event.eventType] ?? "bg-muted text-muted-foreground";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <span className={cn("text-xs px-2 py-0.5 rounded font-medium mt-0.5 shrink-0", colorClass)}>
        {event.eventType.replace(/_/g, " ")}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{event.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(event.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats } = useGetDashboardStats();
  const { data: activity } = useGetRecentActivity();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your {isAdmin ? "Proxmox infrastructure" : "assigned virtual machines"}</p>
      </div>

      {/* Stats grid */}
      {isAdmin ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Clusters"
            value={stats?.totalClusters}
            sub={stats ? `${stats.onlineClusters} online` : undefined}
            icon={Server}
            color="bg-blue-500/10 text-blue-400"
          />
          <StatCard
            label="Virtual Machines"
            value={stats?.totalVms}
            sub={stats ? `${stats.runningVms} running` : undefined}
            icon={Monitor}
            color="bg-green-500/10 text-green-400"
          />
          <StatCard
            label="Tenants"
            value={stats?.totalTenants}
            sub={stats ? `${stats.activeTenants} active` : undefined}
            icon={Building2}
            color="bg-purple-500/10 text-purple-400"
          />
          <StatCard
            label="Users"
            value={stats?.totalUsers}
            sub={stats ? `${stats.activeUsers} active` : undefined}
            icon={Users}
            color="bg-orange-500/10 text-orange-400"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="My Virtual Machines"
            value={stats?.totalVms}
            sub={stats ? `${stats.runningVms} running` : undefined}
            icon={Monitor}
            color="bg-green-500/10 text-green-400"
          />
        </div>
      )}

      {/* VM Status row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-foreground">Running VMs</span>
          </div>
          {stats === undefined ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="text-3xl font-bold text-green-400">{stats.runningVms}</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Square className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Stopped VMs</span>
          </div>
          {stats === undefined ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <p className="text-3xl font-bold text-muted-foreground">{stats.stoppedVms}</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
        </div>
        <div className="px-4 py-2">
          {activity === undefined ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No recent activity</p>
          ) : (
            activity.slice(0, 10).map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
