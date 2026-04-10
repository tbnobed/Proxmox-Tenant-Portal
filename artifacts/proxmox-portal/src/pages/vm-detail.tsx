import { useParams, Link } from "wouter";
import {
  useGetVm,
  useVmAction,
  useListUserVmAccess,
  getGetVmQueryKey,
  getListVmsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Square, RotateCcw, Cpu, MemoryStick, HardDrive, Network, Server, Building2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-green-500/10 text-green-400 border-green-500/20",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}

export default function VmDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: vm, isLoading } = useGetVm(id, { query: { enabled: !!id } });
  const { data: allUserVmAccess } = useListUserVmAccess();
  const qc = useQueryClient();
  const { toast } = useToast();
  const actionMutation = useVmAction();
  const [actioning, setActioning] = useState<string | null>(null);

  const vmUserAccess = allUserVmAccess?.filter(a => a.vmId === id) ?? [];

  function handleAction(action: string) {
    setActioning(action);
    actionMutation.mutate({ id, data: { action } }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getGetVmQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: result.message });
        setActioning(null);
      },
      onError: () => {
        toast({ title: "Action failed", variant: "destructive" });
        setActioning(null);
      },
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/vms" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">{vm?.name}</h1>
              {vm && <StatusBadge status={vm.status} />}
              {vm && <span className="text-xs text-muted-foreground uppercase">{vm.type}</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">VMID: {vm?.vmId} — Node: {vm?.node}</p>
          </div>
        )}
        {vm && (
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/vms/${id}/console`}>
              <Button size="sm" variant="outline">
                <Monitor className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Console
              </Button>
            </Link>
            {vm.status !== "running" && (
              <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("start")}>
                <Play className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                {actioning === "start" ? "Starting..." : "Start"}
              </Button>
            )}
            {vm.status === "running" && (
              <>
                <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("stop")}>
                  <Square className="w-3.5 h-3.5 mr-1.5 text-red-400" />
                  {actioning === "stop" ? "Stopping..." : "Stop"}
                </Button>
                <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("reboot")}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-yellow-400" />
                  {actioning === "reboot" ? "Rebooting..." : "Reboot"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {vm && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Specs */}
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Specifications</h2>
            </div>
            <div className="divide-y divide-border">
              {[
                { icon: Cpu, label: "CPU", value: vm.cpus ? `${vm.cpus} vCPU` : "—" },
                { icon: MemoryStick, label: "Memory", value: vm.memoryMb ? `${vm.memoryMb} MB` : "—" },
                { icon: HardDrive, label: "Disk", value: vm.diskGb ? `${vm.diskGb} GB` : "—" },
                { icon: Network, label: "IP Address", value: vm.ipAddress ?? "—" },
                { icon: Server, label: "Cluster", value: vm.clusterName },
                { icon: Server, label: "Node", value: vm.node },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ))}
              {vm.os && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-muted-foreground ml-6">OS</span>
                  <span className="text-sm font-medium text-foreground">{vm.os}</span>
                </div>
              )}
            </div>
          </div>

          {/* Access & Tenant */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Tenant</h2>
              </div>
              <div className="px-4 py-3">
                {vm.tenantId ? (
                  <Link href={`/tenants/${vm.tenantId}`} className="text-sm font-medium text-primary hover:underline">
                    {vm.tenantName}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Not assigned to a tenant</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">User Access</h2>
              </div>
              {vmUserAccess.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-3">No users have direct access to this VM</p>
              ) : (
                <div className="divide-y divide-border">
                  {vmUserAccess.map(a => (
                    <Link key={a.id} href={`/users/${a.userId}`} className="block px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <p className="text-sm font-medium text-foreground">{a.userName}</p>
                      <p className="text-xs text-muted-foreground">Since {new Date(a.grantedAt).toLocaleDateString()}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {vm.tags && (
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {vm.tags.split(",").map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{tag.trim()}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
