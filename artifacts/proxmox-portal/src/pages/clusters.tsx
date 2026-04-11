import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useListClusters,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useSyncCluster,
  useListVms,
  getListClustersQueryKey,
  getListVmsQueryKey,
} from "@workspace/api-client-react";
import type { Cluster, CreateClusterBody, UpdateClusterBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, RefreshCw, Pencil, Trash2, Server, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { computeNodeHealth, aggregateHealth, getHealthResult, type HealthLevel } from "@/lib/health";

interface NodeStatus {
  node: string;
  status: string;
  cpuUsage: number;
  cpuCount: number;
  cpuModel: string;
  loadAverage: string;
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  rootFsUsed: number;
  rootFsTotal: number;
  ioDelay: number;
  ksmSharing: number;
  kernelVersion: string;
  pveVersion: string;
  bootMode: string;
  uptime: number;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    online: "bg-olive/20 text-sand border-olive/30",
    offline: "bg-red-500/10 text-red-400 border-red-500/20",
    unknown: "bg-navy/40 text-sand border-navy/50",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", variants[status] ?? variants.unknown)}>
      {status}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(2)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-secondary/30 rounded-full overflow-hidden mt-1">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function NodeHealthBadge({ node }: { node: NodeStatus }) {
  const level = computeNodeHealth(node);
  const h = getHealthResult(level);
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-1", h.bgColor, h.color, h.borderColor)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", h.dotColor)} />
      {h.label}
    </span>
  );
}

function NodeStatusCard({ node }: { node: NodeStatus }) {
  const cpuPercent = (node.cpuUsage * 100);
  const memPercent = node.memTotal > 0 ? (node.memUsed / node.memTotal * 100) : 0;
  const diskPercent = node.rootFsTotal > 0 ? (node.rootFsUsed / node.rootFsTotal * 100) : 0;
  const swapPercent = node.swapTotal > 0 ? (node.swapUsed / node.swapTotal * 100) : 0;

  return (
    <div className="rounded-md border border-border/60 bg-secondary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", node.status === "online" ? "bg-olive animate-pulse" : node.status === "error" ? "bg-red-500" : "bg-muted-foreground")} />
          <span className="text-sm font-semibold text-sand">{node.node}</span>
          {node.status !== "online" && <span className="text-[10px] text-red-400">{node.status}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">uptime {formatUptime(node.uptime)}</span>
          <NodeHealthBadge node={node} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><line x1="9" y1="15" x2="9.01" y2="15"/><line x1="15" y1="15" x2="15.01" y2="15"/></svg>
            CPU usage
          </span>
          <span className="text-foreground font-medium">{cpuPercent.toFixed(2)}% of {node.cpuCount} CPU(s)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="12"/></svg>
            IO delay
          </span>
          <span className="text-foreground font-medium">{(node.ioDelay * 100).toFixed(2)}%</span>
        </div>

        <div>
          <UsageBar percent={cpuPercent} color="bg-olive" />
        </div>
        <div />

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
            Load average
          </span>
          <span className="text-foreground font-medium">{node.loadAverage}</span>
        </div>
        <div />

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/></svg>
            RAM usage
          </span>
          <span className="text-foreground font-medium">{memPercent.toFixed(2)}% ({formatBytes(node.memUsed)} of {formatBytes(node.memTotal)})</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">KSM sharing</span>
          <span className="text-foreground font-medium">{formatBytes(node.ksmSharing)}</span>
        </div>

        <div>
          <UsageBar percent={memPercent} color={memPercent > 80 ? "bg-red-500" : "bg-olive"} />
        </div>
        <div />

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
            / HD space
          </span>
          <span className="text-foreground font-medium">{diskPercent.toFixed(2)}% ({formatBytes(node.rootFsUsed)} of {formatBytes(node.rootFsTotal)})</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            SWAP usage
          </span>
          <span className="text-foreground font-medium">
            {swapPercent.toFixed(2)}% ({formatBytes(node.swapUsed)} of {formatBytes(node.swapTotal)})
          </span>
        </div>

        <div>
          <UsageBar percent={diskPercent} color={diskPercent > 80 ? "bg-red-500" : "bg-olive"} />
        </div>
        <div>
          <UsageBar percent={swapPercent} color={swapPercent > 80 ? "bg-red-500" : "bg-olive"} />
        </div>
      </div>

      <div className="border-t border-border/40 pt-2 grid grid-cols-1 gap-1 text-xs">
        {node.cpuModel && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">CPU(s)</span>
            <span className="text-foreground">{node.cpuCount} x {node.cpuModel}</span>
          </div>
        )}
        {node.kernelVersion && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kernel Version</span>
            <span className="text-foreground">{node.kernelVersion}</span>
          </div>
        )}
        {node.bootMode && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Boot Mode</span>
            <span className="text-foreground uppercase">{node.bootMode}</span>
          </div>
        )}
        {node.pveVersion && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Manager Version</span>
            <span className="text-foreground">{node.pveVersion}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ClusterFormData {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  realm: string;
}

const defaultForm: ClusterFormData = { name: "", host: "", port: "8006", username: "root", password: "", realm: "pam" };

function useClusterNodes(clusterId: number, enabled: boolean) {
  const [data, setData] = useState<NodeStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clusters/${clusterId}/nodes`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const nodes = await res.json();
      setData(nodes);
    } catch (e: any) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    if (enabled && !data && !loading) {
      fetchNodes();
    }
  }, [enabled, data, loading, fetchNodes]);

  return { data, loading, error, refetch: fetchNodes };
}

export default function ClustersPage() {
  const { data: clusters, isLoading } = useListClusters();
  const { data: allVms } = useListVms();
  const qc = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateCluster();
  const updateMutation = useUpdateCluster();
  const deleteMutation = useDeleteCluster();
  const syncMutation = useSyncCluster();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [deleteCluster, setDeleteCluster] = useState<Cluster | null>(null);
  const [form, setForm] = useState<ClusterFormData>(defaultForm);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  const clusterStats = useMemo(() => {
    if (!allVms) return new Map();
    const map = new Map<number, { total: number; running: number; stopped: number; paused: number }>();
    for (const vm of allVms) {
      if (!map.has(vm.clusterId)) {
        map.set(vm.clusterId, { total: 0, running: 0, stopped: 0, paused: 0 });
      }
      const s = map.get(vm.clusterId)!;
      s.total++;
      if (vm.status === "running") s.running++;
      else if (vm.status === "stopped") s.stopped++;
      else if (vm.status === "paused") s.paused++;
    }
    return map;
  }, [allVms]);

  function toggleExpand(id: number) {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setForm(defaultForm);
    setCreateOpen(true);
  }

  function openEdit(c: Cluster) {
    setForm({ name: c.name, host: c.host, port: String(c.port), username: c.username, password: "", realm: c.realm });
    setEditCluster(c);
  }

  function handleCreate() {
    const data: CreateClusterBody = {
      name: form.name,
      host: form.host,
      port: parseInt(form.port, 10),
      username: form.username,
      password: form.password,
      realm: form.realm,
    };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListClustersQueryKey() });
        setCreateOpen(false);
        toast({ title: "Cluster added", description: `${form.name} has been registered.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to add cluster.", variant: "destructive" }),
    });
  }

  function handleEdit() {
    if (!editCluster) return;
    const data: UpdateClusterBody = {
      name: form.name,
      host: form.host,
      port: parseInt(form.port, 10),
      username: form.username,
      realm: form.realm,
      ...(form.password ? { password: form.password } : {}),
    };
    updateMutation.mutate({ id: editCluster.id, data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListClustersQueryKey() });
        setEditCluster(null);
        toast({ title: "Cluster updated" });
      },
      onError: () => toast({ title: "Error", description: "Failed to update cluster.", variant: "destructive" }),
    });
  }

  function handleDelete() {
    if (!deleteCluster) return;
    deleteMutation.mutate({ id: deleteCluster.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListClustersQueryKey() });
        setDeleteCluster(null);
        toast({ title: "Cluster removed" });
      },
      onError: () => toast({ title: "Error", description: "Failed to delete cluster.", variant: "destructive" }),
    });
  }

  function handleSync(id: number) {
    setSyncingId(id);
    syncMutation.mutate({ id }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getListClustersQueryKey() });
        qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
        toast({ title: "Sync complete", description: `${result.synced} VMs synced (${result.added} added, ${result.updated} updated).` });
        setSyncingId(null);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Could not connect to Proxmox";
        toast({ title: "Sync failed", description: msg, variant: "destructive" });
        setSyncingId(null);
      },
    });
  }

  const ClusterForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Production Cluster" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="host">Host / IP</Label>
          <Input id="host" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="192.168.1.100" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="port">Port</Label>
          <Input id="port" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="8006" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="root" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="realm">Realm</Label>
          <Input id="realm" value={form.realm} onChange={e => setForm(f => ({ ...f, realm: e.target.value }))} placeholder="pam" className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="password">Password {editCluster && <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>}</Label>
          <Input id="password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="mt-1" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Clusters</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your Proxmox cluster connections</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Add Cluster
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
        </div>
      ) : clusters?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No clusters registered yet</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">Add your first cluster</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {clusters?.map(c => {
            const stats = clusterStats.get(c.id);
            const isExpanded = expandedClusters.has(c.id);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-start gap-3 px-3 sm:px-5 py-3 sm:py-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-forest/40 flex items-center justify-center shrink-0">
                    <Server className="w-4 h-4 sm:w-5 sm:h-5 text-sand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link href={`/clusters/${c.id}`} className="font-semibold text-foreground hover:text-sand transition-colors truncate text-sm sm:text-base">
                          {c.name}
                        </Link>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="flex items-center shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8"
                          onClick={() => toggleExpand(c.id)}
                          title="Node details"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:h-8 sm:w-8"
                          onClick={() => handleSync(c.id)}
                          disabled={syncingId === c.id}
                          title="Sync VMs"
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", syncingId === c.id && "animate-spin")} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => openEdit(c)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => setDeleteCluster(c)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {c.host}:{c.port} &mdash; {c.username}@{c.realm}
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-3 px-5 pb-4 text-xs">
                  <div className="text-center px-2">
                    <p className="text-lg font-bold text-foreground leading-none">{stats?.total ?? c.vmCount}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">VMs</p>
                  </div>
                  <div className="text-center px-2 border-l border-border/40">
                    <p className="text-lg font-bold text-olive leading-none">{stats?.running ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Running</p>
                  </div>
                  <div className="text-center px-2 border-l border-border/40">
                    <p className="text-lg font-bold text-red-400 leading-none">{stats?.stopped ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Stopped</p>
                  </div>
                  {(stats?.paused ?? 0) > 0 && (
                    <div className="text-center px-2 border-l border-border/40">
                      <p className="text-lg font-bold text-yellow-400 leading-none">{stats?.paused ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Paused</p>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <ClusterNodePanel clusterId={c.id} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cluster</DialogTitle>
            <DialogDescription>Connect a Proxmox server to manage its VMs.</DialogDescription>
          </DialogHeader>
          {ClusterForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCluster} onOpenChange={v => !v && setEditCluster(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cluster</DialogTitle>
            <DialogDescription>Update the connection details for this Proxmox server.</DialogDescription>
          </DialogHeader>
          {ClusterForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCluster(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCluster} onOpenChange={v => !v && setDeleteCluster(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove cluster?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteCluster?.name}</strong> and all its VM records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClusterNodePanel({ clusterId }: { clusterId: number }) {
  const { data, loading, error, refetch } = useClusterNodes(clusterId, true);

  if (loading) {
    return (
      <div className="border-t border-border bg-secondary/5 px-5 py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Connecting to Proxmox...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-border bg-secondary/5 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-400">Failed to fetch node status: {error}</p>
          <Button variant="ghost" size="sm" onClick={refetch}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="border-t border-border bg-secondary/5 px-5 py-4">
        <p className="text-sm text-muted-foreground">No nodes found</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-secondary/5 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          {data.length} Node{data.length !== 1 ? "s" : ""}
        </p>
        <Button variant="ghost" size="sm" onClick={refetch} className="h-6 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {data.map(node => (
          <NodeStatusCard key={node.node} node={node} />
        ))}
      </div>
    </div>
  );
}
