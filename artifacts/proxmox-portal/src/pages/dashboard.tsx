import { useState, useEffect, useCallback } from "react";
import { useGetDashboardStats, useGetRecentActivity, useListVms } from "@workspace/api-client-react";
import type { Vm } from "@workspace/api-client-react";
import { Server, Building2, Users, Monitor, Activity, Play, Square, HeartPulse, Cpu, HardDrive, MemoryStick, ChevronDown, ChevronRight, ExternalLink, Pause, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import {
  computeNodeHealth,
  computeVmHealth,
  aggregateHealth,
  getHealthResult,
  type HealthLevel,
} from "@/lib/health";

interface ClusterHealthData {
  clusterId: number;
  clusterName: string;
  status: string;
  nodes: {
    name: string;
    status: string;
    cpuUsage: number;
    memUsed: number;
    memTotal: number;
    rootFsUsed: number;
    rootFsTotal: number;
    uptime: number;
  }[];
  vms: { total: number; running: number; stopped: number; paused: number };
}

function useInfraHealth(enabled: boolean) {
  const [data, setData] = useState<ClusterHealthData[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}api/dashboard/health`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json.clusters);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) fetch_();
  }, [enabled, fetch_]);

  return { data, loading, refetch: fetch_ };
}

function HealthDot({ level, size = "sm" }: { level: HealthLevel; size?: "sm" | "md" }) {
  const h = getHealthResult(level);
  const sizeClass = size === "md" ? "w-3 h-3" : "w-2 h-2";
  return (
    <span className={cn(sizeClass, "rounded-full inline-block shrink-0", h.dotColor, level === "healthy" && "animate-pulse")} />
  );
}

function HealthBadge({ level }: { level: HealthLevel }) {
  const h = getHealthResult(level);
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium inline-flex items-center gap-1.5", h.bgColor, h.color, h.borderColor)}>
      <HealthDot level={level} />
      {h.label}
    </span>
  );
}

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
    vm_start: "bg-olive/20 text-sand",
    vm_stop: "bg-red-500/10 text-red-400",
    vm_reboot: "bg-sand/15 text-sand",
    vm_sync: "bg-sand/10 text-sand",
    tenant_created: "bg-forest/40 text-sand",
    user_created: "bg-sand/15 text-sand",
    access_granted: "bg-olive/20 text-sand",
    access_revoked: "bg-sand/15 text-sand",
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

function UsageBar({ percent, label, value }: { percent: number; label: string; value: string }) {
  const color = percent > 90 ? "bg-red-500" : percent > 75 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
      <div className="w-full h-1.5 bg-secondary/30 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function InfraHealthPanel({ clusters }: { clusters: ClusterHealthData[] }) {
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

  const allNodeHealthLevels = clusters.flatMap(c =>
    c.nodes.length > 0
      ? c.nodes.map(n => computeNodeHealth(n))
      : (c.status === "offline" ? ["offline" as HealthLevel] : ["unknown" as HealthLevel])
  );
  const overallHealth = aggregateHealth(allNodeHealthLevels);

  const totalNodes = clusters.reduce((s, c) => s + c.nodes.length, 0);
  const onlineNodes = clusters.reduce((s, c) => s + c.nodes.filter(n => n.status === "online").length, 0);
  const totalVms = clusters.reduce((s, c) => s + c.vms.total, 0);
  const runningVms = clusters.reduce((s, c) => s + c.vms.running, 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-border flex-wrap">
        <HeartPulse className="w-5 h-5 text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Infrastructure Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalNodes} node{totalNodes !== 1 ? "s" : ""} across {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} — {runningVms}/{totalVms} VMs running
          </p>
        </div>
        <HealthBadge level={overallHealth} />
      </div>

      <div className="divide-y divide-border">
        {clusters.map(cluster => {
          const clusterNodeLevels = cluster.nodes.length > 0
            ? cluster.nodes.map(n => computeNodeHealth(n))
            : [cluster.status === "offline" ? "offline" as HealthLevel : "unknown" as HealthLevel];
          const clusterHealth = aggregateHealth(clusterNodeLevels);
          const isExpanded = expandedCluster === cluster.clusterId;

          return (
            <div key={cluster.clusterId}>
              <button
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors text-left"
                onClick={() => setExpandedCluster(isExpanded ? null : cluster.clusterId)}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                <HealthDot level={clusterHealth} size="md" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{cluster.clusterName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {cluster.nodes.length} node{cluster.nodes.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
                  <span className="text-muted-foreground">
                    <span className="text-emerald-400 font-medium">{cluster.vms.running}</span> running
                  </span>
                  {cluster.vms.stopped > 0 && (
                    <span className="text-muted-foreground">
                      <span className="text-red-400 font-medium">{cluster.vms.stopped}</span> stopped
                    </span>
                  )}
                </div>
                <HealthBadge level={clusterHealth} />
              </button>

              {isExpanded && cluster.nodes.length > 0 && (
                <div className="px-5 pb-4 pt-1">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {cluster.nodes.map(node => {
                      const nodeHealth = computeNodeHealth(node);
                      const cpuPercent = node.cpuUsage * 100;
                      const memPercent = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 0;
                      const diskPercent = node.rootFsTotal > 0 ? (node.rootFsUsed / node.rootFsTotal) * 100 : 0;

                      return (
                        <div key={node.name} className="rounded-md border border-border/60 bg-secondary/5 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <HealthDot level={nodeHealth} size="md" />
                              <span className="text-sm font-medium text-foreground">{node.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">up {formatUptime(node.uptime)}</span>
                              <HealthBadge level={nodeHealth} />
                            </div>
                          </div>
                          <UsageBar percent={cpuPercent} label="CPU" value={`${cpuPercent.toFixed(1)}%`} />
                          <UsageBar percent={memPercent} label="RAM" value={`${formatBytes(node.memUsed)} / ${formatBytes(node.memTotal)}`} />
                          <UsageBar percent={diskPercent} label="Disk" value={`${diskPercent.toFixed(1)}%`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isExpanded && cluster.nodes.length === 0 && (
                <div className="px-5 pb-4 pt-1">
                  <p className="text-sm text-muted-foreground">Unable to reach cluster — no node data available</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VmHealthCard({ vm }: { vm: Vm }) {
  const health = computeVmHealth(vm);
  const h = getHealthResult(health);
  const statusIcon = vm.status === "running"
    ? <Play className="w-3 h-3 text-emerald-400" />
    : vm.status === "paused"
    ? <Pause className="w-3 h-3 text-yellow-400" />
    : <Square className="w-3 h-3 text-gray-400" />;

  return (
    <Link href={`/vms/${vm.id}`} className="block">
      <div className="rounded-md border border-border/60 bg-secondary/5 p-3 hover:bg-secondary/10 transition-colors space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HealthDot level={health} size="md" />
            <span className="text-sm font-medium text-foreground truncate">{vm.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-1", h.bgColor, h.color, h.borderColor)}>
              {statusIcon}
              {vm.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu className="w-3 h-3 shrink-0" />
            <span>{vm.cpus ?? "—"} vCPU{(vm.cpus ?? 0) !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MemoryStick className="w-3 h-3 shrink-0" />
            <span>{vm.memoryMb ? `${vm.memoryMb >= 1024 ? `${(vm.memoryMb / 1024).toFixed(1)} GB` : `${vm.memoryMb} MB`}` : "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="w-3 h-3 shrink-0" />
            <span>{vm.diskGb ? `${vm.diskGb} GB` : "—"}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{vm.clusterName ?? `Cluster #${vm.clusterId}`}</span>
          {vm.ipAddress && <span className="font-mono shrink-0">{vm.ipAddress}</span>}
        </div>
      </div>
    </Link>
  );
}

function MyVmsHealthPanel({ vms }: { vms: Vm[] }) {
  const running = vms.filter(v => v.status === "running");
  const stopped = vms.filter(v => v.status === "stopped");
  const paused = vms.filter(v => v.status === "paused");
  const other = vms.filter(v => !["running", "stopped", "paused"].includes(v.status));

  const allHealthLevels = vms.map(v => computeVmHealth(v));
  const overallHealth = aggregateHealth(allHealthLevels);
  const needsAttention = stopped.length + paused.length + other.length;

  const attentionParts: string[] = [];
  if (paused.length > 0) attentionParts.push(`${paused.length} paused`);
  if (stopped.length > 0) attentionParts.push(`${stopped.length} stopped`);
  if (other.length > 0) attentionParts.push(`${other.length} unknown`);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-border flex-wrap">
        <HeartPulse className="w-5 h-5 text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">My VMs Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {vms.length} VM{vms.length !== 1 ? "s" : ""} — {running.length} running
            {stopped.length > 0 && `, ${stopped.length} stopped`}
            {paused.length > 0 && `, ${paused.length} paused`}
          </p>
        </div>
        <HealthBadge level={overallHealth} />
      </div>

      {needsAttention > 0 && (
        <div className="px-4 py-2.5 bg-yellow-500/5 border-b border-yellow-500/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <p className="text-xs text-yellow-500">
            {needsAttention} VM{needsAttention !== 1 ? "s" : ""} {needsAttention !== 1 ? "need" : "needs"} attention — {attentionParts.join(", ")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-px bg-border/30">
        <div className="bg-card px-4 py-3 text-center">
          <p className="text-lg font-bold text-emerald-400">{running.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Running</p>
        </div>
        <div className="bg-card px-4 py-3 text-center">
          <p className="text-lg font-bold text-gray-400">{stopped.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Stopped</p>
        </div>
        <div className="bg-card px-4 py-3 text-center">
          <p className="text-lg font-bold text-yellow-400">{paused.length + other.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Other</p>
        </div>
      </div>

      <div className="p-3 md:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {vms.map(vm => (
            <VmHealthCard key={vm.id} vm={vm} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats } = useGetDashboardStats();
  const { data: activity } = useGetRecentActivity();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: healthData, loading: healthLoading } = useInfraHealth(isAdmin);
  const { data: myVms, isLoading: myVmsLoading } = useListVms(undefined, { query: { enabled: !isAdmin } });

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your {isAdmin ? "Proxmox infrastructure" : "assigned virtual machines"}</p>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Clusters"
            value={stats?.totalClusters}
            sub={stats ? `${stats.onlineClusters} online` : undefined}
            icon={Server}
            color="bg-sand/10 text-sand"
          />
          <StatCard
            label="Virtual Machines"
            value={stats?.totalVms}
            sub={stats ? `${stats.runningVms} running` : undefined}
            icon={Monitor}
            color="bg-olive/20 text-sand"
          />
          <StatCard
            label="Tenants"
            value={stats?.totalTenants}
            sub={stats ? `${stats.activeTenants} active` : undefined}
            icon={Building2}
            color="bg-forest/40 text-sand"
          />
          <StatCard
            label="Users"
            value={stats?.totalUsers}
            sub={stats ? `${stats.activeUsers} active` : undefined}
            icon={Users}
            color="bg-sand/15 text-sand"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="My Virtual Machines"
            value={stats?.totalVms}
            sub={stats ? `${stats.runningVms} running` : undefined}
            icon={Monitor}
            color="bg-olive/20 text-sand"
          />
          <StatCard
            label="Running"
            value={stats?.runningVms}
            icon={Play}
            color="bg-emerald-500/15 text-emerald-400"
          />
          <StatCard
            label="Stopped"
            value={stats?.stoppedVms}
            icon={Square}
            color="bg-gray-500/15 text-gray-400"
          />
          <StatCard
            label="Tenant"
            value={user?.tenantId ? 1 : 0}
            sub={user?.tenantName ?? (user?.tenantId ? "Assigned" : "None")}
            icon={Building2}
            color="bg-forest/40 text-sand"
          />
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Play className="w-4 h-4 text-olive" />
              <span className="text-sm font-medium text-foreground">Running VMs</span>
            </div>
            {stats === undefined ? (
              <Skeleton className="h-9 w-20" />
            ) : (
              <p className="text-3xl font-bold text-olive">{stats.runningVms}</p>
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
      )}

      {isAdmin && (
        healthLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : healthData && healthData.length > 0 ? (
          <InfraHealthPanel clusters={healthData} />
        ) : null
      )}

      {!isAdmin && (
        myVmsLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : myVms && myVms.length > 0 ? (
          <MyVmsHealthPanel vms={myVms} />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No VMs assigned to you yet</p>
            <p className="text-xs text-muted-foreground mt-1">Contact your admin to get VM access</p>
          </div>
        )
      )}

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
