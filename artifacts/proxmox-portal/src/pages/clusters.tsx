import { useState } from "react";
import {
  useListClusters,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useSyncCluster,
  getListClustersQueryKey,
} from "@workspace/api-client-react";
import type { Cluster, CreateClusterBody, UpdateClusterBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, RefreshCw, Pencil, Trash2, Server, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    online: "bg-green-500/10 text-green-400 border-green-500/20",
    offline: "bg-red-500/10 text-red-400 border-red-500/20",
    unknown: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", variants[status] ?? variants.unknown)}>
      {status}
    </span>
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

export default function ClustersPage() {
  const { data: clusters, isLoading } = useListClusters();
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
        toast({ title: "Sync complete", description: `${result.synced} VMs synced (${result.added} added, ${result.updated} updated).` });
        setSyncingId(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not connect to Proxmox";
        toast({ title: "Sync failed", description: msg, variant: "destructive" });
        setSyncingId(null);
      },
    });
  }

  const ClusterForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
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
        <div className="col-span-2">
          <Label htmlFor="password">Password {editCluster && <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>}</Label>
          <Input id="password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="mt-1" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clusters</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your Proxmox cluster connections</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Add Cluster
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : clusters?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No clusters registered yet</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">Add your first cluster</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {clusters?.map(c => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/clusters/${c.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {c.name}
                  </Link>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{c.host}:{c.port} &mdash; {c.username}@{c.realm} &mdash; {c.vmCount} VMs</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSync(c.id)}
                  disabled={syncingId === c.id}
                >
                  <RefreshCw className={cn("w-4 h-4", syncingId === c.id && "animate-spin")} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteCluster(c)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Cluster</DialogTitle></DialogHeader>
          {ClusterForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCluster} onOpenChange={v => !v && setEditCluster(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Cluster</DialogTitle></DialogHeader>
          {ClusterForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCluster(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
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
