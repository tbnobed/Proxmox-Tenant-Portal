import { useState } from "react";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  getListTenantsQueryKey,
} from "@workspace/api-client-react";
import type { Tenant, CreateTenantBody, UpdateTenantBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Building2, Users, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    inactive: "bg-muted text-muted-foreground border-border",
    suspended: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.active)}>
      {status}
    </span>
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
          {tenants?.map(t => (
            <div key={t.id} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/tenants/${t.id}`}>
                    <a className="font-medium text-foreground hover:text-primary transition-colors">{t.name}</a>
                  </Link>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex items-center gap-4 mt-1">
                  {t.contactEmail && <p className="text-xs text-muted-foreground">{t.contactEmail}</p>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {t.userCount} users
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {t.vmCount} VMs
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTenant(t)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
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
