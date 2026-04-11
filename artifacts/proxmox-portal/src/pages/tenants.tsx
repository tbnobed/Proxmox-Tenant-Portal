import { useState, useEffect, useCallback } from "react";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  useListUsers,
  getListTenantsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { Tenant, CreateTenantBody, UpdateTenantBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Building2, Users, Monitor, Settings2, ChevronDown, ChevronUp, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL ?? "/";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-olive/20 text-sand border-olive/30",
    inactive: "bg-muted text-muted-foreground border-border",
    suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.active)}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-olive/20 text-sand border-olive/30",
    operator: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    viewer: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium", map[role] ?? map.viewer)}>
      {role}
    </span>
  );
}

interface TenantUsersProps {
  tenantId: number;
}

function TenantUsers({ tenantId }: TenantUsersProps) {
  const { data: allUsers } = useListUsers();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const tenantUsers = allUsers?.filter(u => u.tenantId === tenantId) ?? [];
  const unassignedUsers = allUsers?.filter(u => u.tenantId == null && u.role !== "admin") ?? [];

  const updateUser = useCallback(async (userId: number, newTenantId: number | null) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: newTenantId }),
      });
      if (!res.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    } catch {
      toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [qc, toast]);

  function handleAdd() {
    if (!addUserId) return;
    updateUser(parseInt(addUserId), tenantId);
    setAddUserId("");
  }

  function handleRemove(userId: number) {
    updateUser(userId, null);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members</p>
      </div>

      {tenantUsers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No users assigned</p>
      ) : (
        <div className="space-y-1.5">
          {tenantUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-secondary/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-olive/20 flex items-center justify-center text-xs font-bold text-olive shrink-0">
                  {(u.fullName || u.username).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.fullName || u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RoleBadge role={u.role} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(u.id)}
                  disabled={loading}
                  title="Remove from tenant"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {unassignedUsers.length > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <Select value={addUserId} onValueChange={setAddUserId}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Add a user..." />
            </SelectTrigger>
            <SelectContent>
              {unassignedUsers.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.fullName || u.username} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAdd} disabled={!addUserId || loading}>
            <UserPlus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}

interface FormData {
  name: string;
  description: string;
  contactEmail: string;
}

const defaultForm: FormData = { name: "", description: "", contactEmail: "" };

export default function TenantsPage() {
  const { data: tenants, isLoading } = useListTenants();
  const qc = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());

  function toggleExpand(id: number) {
    setExpandedTenants(prev => {
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

  function openEdit(t: Tenant) {
    setForm({ name: t.name, description: t.description ?? "", contactEmail: t.contactEmail ?? "" });
    setEditTenant(t);
  }

  function handleCreate() {
    const data: CreateTenantBody = {
      name: form.name,
      description: form.description || null,
      contactEmail: form.contactEmail || null,
    };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setCreateOpen(false);
        toast({ title: "Tenant created", description: `${form.name} has been created.` });
      },
      onError: () => toast({ title: "Error", description: "Failed to create tenant.", variant: "destructive" }),
    });
  }

  function handleEdit() {
    if (!editTenant) return;
    const data: UpdateTenantBody = {
      name: form.name,
      description: form.description || null,
      contactEmail: form.contactEmail || null,
    };
    updateMutation.mutate({ id: editTenant.id, data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setEditTenant(null);
        toast({ title: "Tenant updated" });
      },
      onError: () => toast({ title: "Error", description: "Failed to update tenant.", variant: "destructive" }),
    });
  }

  function handleDelete() {
    if (!deleteTenant) return;
    deleteMutation.mutate({ id: deleteTenant.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setDeleteTenant(null);
        toast({ title: "Tenant deleted" });
      },
      onError: () => toast({ title: "Error", description: "Failed to delete tenant.", variant: "destructive" }),
    });
  }

  const TenantForm = (
    <div className="space-y-4">
      <div>
        <Label htmlFor="t-name">Name</Label>
        <Input id="t-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="t-desc">Description</Label>
        <Input id="t-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="t-email">Contact Email</Label>
        <Input id="t-email" type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="admin@acme.com" className="mt-1" />
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage organizations with VM access</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> New Tenant
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : tenants?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No tenants yet</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">Create your first tenant</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants?.map(t => {
            const isExpanded = expandedTenants.has(t.id);
            return (
              <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-md bg-forest/40 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-sand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/tenants/${t.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {t.name}
                      </Link>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      {t.contactEmail && <p className="text-xs text-muted-foreground">{t.contactEmail}</p>}
                      <button
                        onClick={() => toggleExpand(t.id)}
                        className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <Users className="w-3 h-3" /> {t.userCount} users
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Monitor className="w-3 h-3" /> {t.vmCount} VMs
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link href={`/tenants/${t.id}`}>
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <Settings2 className="w-3.5 h-3.5" /> Quotas & Access
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTenant(t)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {isExpanded && <TenantUsers tenantId={t.id} />}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Tenant</DialogTitle></DialogHeader>
          {TenantForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTenant} onOpenChange={v => !v && setEditTenant(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Tenant</DialogTitle></DialogHeader>
          {TenantForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTenant} onOpenChange={v => !v && setDeleteTenant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTenant?.name}</strong> and revoke all their VM access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
