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
import { ArrowLeft, Play, Square, RotateCcw, Cpu, MemoryStick, HardDrive, Network, Server, Building2, Monitor, Camera, Trash2, History, Plus, Loader2, Disc, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL ?? "/";

interface MountedMedia {
  drive: string;
  media: string;
}

interface Snapshot {
  name: string;
  description?: string;
  snaptime?: number;
  vmstate?: number;
  parent?: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-olive/20 text-sand border-olive/30",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-navy/40 text-sand border-navy/50",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}

function MediaPanel({ vmId, vmType }: { vmId: number; vmType: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const [media, setMedia] = useState<MountedMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [ejecting, setEjecting] = useState<string | null>(null);

  const fetchMedia = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}api/vms/${vmId}/media`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then(setMedia)
      .catch(() => setMedia([]))
      .finally(() => setLoading(false));
  }, [vmId]);

  useEffect(() => {
    if (vmType === "lxc") { setLoading(false); return; }
    fetchMedia();
  }, [fetchMedia, vmType]);

  if (vmType === "lxc") return null;

  function handleEject(drive: string) {
    if (!confirm(`Eject media from ${drive.toUpperCase()}? The VM will no longer boot from this disc.`)) return;
    setEjecting(drive);
    fetch(`${BASE}api/vms/${vmId}/media/${drive}/unmount`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          toast({ title: data.message });
          fetchMedia();
        } else {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setEjecting(null));
  }

  if (loading) return null;
  if (media.length === 0) return null;

  const extractIsoName = (val: string) => {
    const match = val.match(/([^/]+\.iso)/i);
    return match ? match[1] : val.split(",")[0];
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Disc className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Mounted Media</h2>
      </div>
      <div className="divide-y divide-border">
        {media.map(m => (
          <div key={m.drive} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{m.drive}</span>
                <span className="text-sm text-foreground truncate">{extractIsoName(m.media)}</span>
              </div>
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!ejecting}
                onClick={() => handleEject(m.drive)}
                title="Eject media"
              >
                {ejecting === m.drive ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CircleSlash className="w-3.5 h-3.5 mr-1.5" />
                )}
                {ejecting === m.drive ? "Ejecting..." : "Eject"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapshotsPanel({ vmId, vmType }: { vmId: number; vmType: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [includeState, setIncludeState] = useState(false);
  const [creating, setCreating] = useState(false);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchSnapshots = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    fetch(`${BASE}api/vms/${vmId}/snapshots`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setSnapshots)
      .catch(e => {
        setFetchError(e.message || "Failed to load snapshots");
        setSnapshots([]);
      })
      .finally(() => setLoading(false));
  }, [vmId]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    fetch(`${BASE}api/vms/${vmId}/snapshots`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, includeVmState: includeState }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          toast({ title: data.message });
          setNewName(""); setNewDesc(""); setIncludeState(false); setShowCreateForm(false);
          fetchSnapshots();
        } else {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setCreating(false));
  }

  function handleRollback(snapname: string) {
    if (!confirm(`Restore VM to snapshot "${snapname}"? This will revert the VM to the state when this snapshot was taken.`)) return;
    setActionInProgress(`rollback-${snapname}`);
    fetch(`${BASE}api/vms/${vmId}/snapshots/${encodeURIComponent(snapname)}/rollback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) toast({ title: data.message });
        else toast({ title: "Error", description: data.error, variant: "destructive" });
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setActionInProgress(null));
  }

  function handleDelete(snapname: string) {
    if (!confirm(`Delete snapshot "${snapname}"? This action cannot be undone.`)) return;
    setActionInProgress(`delete-${snapname}`);
    fetch(`${BASE}api/vms/${vmId}/snapshots/${encodeURIComponent(snapname)}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          toast({ title: data.message });
          fetchSnapshots();
        } else {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setActionInProgress(null));
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Snapshots</h2>
          {!loading && <span className="text-xs text-muted-foreground">({snapshots.length})</span>}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Snapshot
          </Button>
        )}
      </div>

      {showCreateForm && canManage && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. before-upgrade"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional description"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
          {vmType === "qemu" && (
            <div className="flex items-center gap-2">
              <Switch checked={includeState} onCheckedChange={setIncludeState} id="vmstate" />
              <Label htmlFor="vmstate" className="text-xs text-muted-foreground cursor-pointer">Include VM RAM state</Label>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={creating || !newName.trim()} onClick={handleCreate}>
              {creating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}
              {creating ? "Creating..." : "Create Snapshot"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : fetchError ? (
        <div className="px-4 py-6 text-center">
          <Camera className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-red-400">{fetchError}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={fetchSnapshots}>Retry</Button>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Camera className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No snapshots yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {snapshots
            .sort((a, b) => (b.snaptime ?? 0) - (a.snaptime ?? 0))
            .map(snap => (
              <div key={snap.name} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{snap.name}</span>
                    {snap.vmstate === 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-olive/10 text-olive border border-olive/20">RAM</span>
                    )}
                  </div>
                  {snap.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{snap.description}</p>
                  )}
                  {snap.snaptime && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(snap.snaptime * 1000).toLocaleString()}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!actionInProgress}
                      onClick={() => handleRollback(snap.name)}
                      title="Restore to this snapshot"
                    >
                      {actionInProgress === `rollback-${snap.name}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <History className="w-3.5 h-3.5 text-sand" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!actionInProgress}
                      onClick={() => handleDelete(snap.name)}
                      title="Delete snapshot"
                    >
                      {actionInProgress === `delete-${snap.name}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
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
    <div className="space-y-6">
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
                <Play className="w-3.5 h-3.5 mr-1.5 text-olive" />
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
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-sand" />
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

      {vm && <MediaPanel vmId={id} vmType={vm.type} />}
      {vm && <SnapshotsPanel vmId={id} vmType={vm.type} />}
    </div>
  );
}
