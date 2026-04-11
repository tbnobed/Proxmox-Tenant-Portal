import { useParams, Link } from "wouter";
import { useGetCluster, useListVms, useSyncCluster, getGetClusterQueryKey, getListVmsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ArrowLeft, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-olive/20 text-sand border-olive/30",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-navy/40 text-sand border-navy/50",
    online: "bg-olive/20 text-sand border-olive/30",
    offline: "bg-red-500/10 text-red-400 border-red-500/20",
    unknown: "bg-navy/40 text-sand border-navy/50",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.unknown)}>
      {status}
    </span>
  );
}

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: cluster, isLoading: loadingCluster } = useGetCluster(id, { query: { enabled: !!id } });
  const { data: vms, isLoading: loadingVms } = useListVms({ clusterId: id });
  const syncMutation = useSyncCluster();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  function handleSync() {
    setSyncing(true);
    syncMutation.mutate({ id }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getGetClusterQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListVmsQueryKey({ clusterId: id }) });
        toast({ title: "Sync complete", description: `${result.synced} VMs synced.` });
        setSyncing(false);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Could not connect to Proxmox";
        toast({ title: "Sync failed", description: msg, variant: "destructive" });
        setSyncing(false);
      },
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clusters" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {loadingCluster ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{cluster?.name}</h1>
              {cluster && <StatusBadge status={cluster.status} />}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{cluster?.host}:{cluster?.port} — {cluster?.username}@{cluster?.realm}</p>
          </div>
        )}
        <Button onClick={handleSync} disabled={syncing} size="sm" variant="outline">
          <RefreshCw className={cn("w-4 h-4 mr-1.5", syncing && "animate-spin")} />
          Sync VMs
        </Button>
      </div>

      {/* VMs */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Virtual Machines</h2>
          </div>
          <span className="text-xs text-muted-foreground">{vms?.length ?? 0} total</span>
        </div>

        {loadingVms ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !vms || vms.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No VMs yet. Click "Sync VMs" to import from Proxmox.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {vms.map(vm => (
              <Link key={vm.id} href={`/vms/${vm.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{vm.name}</span>
                    <StatusBadge status={vm.status} />
                    <span className="text-xs text-muted-foreground uppercase">{vm.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Node: {vm.node} &mdash; VMID: {vm.vmId}
                    {vm.cpus ? ` — ${vm.cpus} vCPU` : ""}
                    {vm.memoryMb ? ` — ${vm.memoryMb}MB RAM` : ""}
                    {vm.ipAddress ? ` — ${vm.ipAddress}` : ""}
                  </p>
                </div>
                {vm.tenantName && (
                  <span className="text-xs text-muted-foreground shrink-0">{vm.tenantName}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
