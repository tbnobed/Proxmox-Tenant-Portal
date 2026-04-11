import { useState } from "react";
import {
  useListVms,
  useListClusters,
  useListTenants,
  useVmAction,
  useDeleteVm,
  getListVmsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import type { Vm } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Monitor, Play, Square, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-olive/20 text-sand border-olive/30",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-navy/40 text-sand border-navy/50",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.stopped)}>
      {status}
    </span>
  );
}

export default function VmsPage() {
  const [clusterFilter, setClusterFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteVm, setDeleteVm] = useState<Vm | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const params: Record<string, number | string> = {};
  if (clusterFilter !== "all") params.clusterId = parseInt(clusterFilter, 10);
  if (tenantFilter !== "all") params.tenantId = parseInt(tenantFilter, 10);
  if (statusFilter !== "all") params.status = statusFilter;

  const { data: vms, isLoading } = useListVms({ params });
  const { data: clusters } = useListClusters();
  const { data: tenants } = useListTenants();
  const qc = useQueryClient();
  const { toast } = useToast();
  const actionMutation = useVmAction();
  const deleteMutation = useDeleteVm();

  function handleAction(vm: Vm, action: string) {
    setActioningId(vm.id);
    actionMutation.mutate({ id: vm.id, data: { action } }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: result.message });
        setActioningId(null);
      },
      onError: () => {
        toast({ title: "Action failed", variant: "destructive" });
        setActioningId(null);
      },
    });
  }

  function handleDelete() {
    if (!deleteVm) return;
    deleteMutation.mutate({ id: deleteVm.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
        setDeleteVm(null);
        toast({ title: "VM removed" });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  const hasFilters = clusterFilter !== "all" || tenantFilter !== "all" || statusFilter !== "all";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Virtual Machines</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage VMs across all clusters</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={clusterFilter} onValueChange={setClusterFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All clusters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clusters</SelectItem>
            {clusters?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tenantFilter} onValueChange={setTenantFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tenants</SelectItem>
            {tenants?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setClusterFilter("all"); setTenantFilter("all"); setStatusFilter("all"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : !vms || vms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No VMs found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Cluster</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Tenant</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Specs</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vms.map(vm => (
                <tr key={vm.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/vms/${vm.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {vm.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">ID: {vm.vmId} — {vm.type.toUpperCase()} — {vm.node}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={vm.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{vm.clusterName}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{vm.tenantName ?? "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {vm.cpus && <span>{vm.cpus}vCPU</span>}
                    {vm.memoryMb && <span> {Math.round(vm.memoryMb / 1024)}GB</span>}
                    {vm.diskGb && <span> {vm.diskGb}GB</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {vm.status !== "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={actioningId === vm.id}
                          onClick={() => handleAction(vm, "start")}
                          title="Start"
                        >
                          <Play className="w-3.5 h-3.5 text-olive" />
                        </Button>
                      )}
                      {vm.status === "running" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={actioningId === vm.id}
                            onClick={() => handleAction(vm, "stop")}
                            title="Stop"
                          >
                            <Square className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={actioningId === vm.id}
                            onClick={() => handleAction(vm, "reboot")}
                            title="Reboot"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-sand" />
                          </Button>
                        </>
                      )}
                      <Link href={`/vms/${vm.id}/console`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Console"
                        >
                          <Monitor className="w-3.5 h-3.5 text-primary" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteVm(vm)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteVm} onOpenChange={v => !v && setDeleteVm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove VM record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteVm?.name}</strong> from the portal. It does not delete the VM from Proxmox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
