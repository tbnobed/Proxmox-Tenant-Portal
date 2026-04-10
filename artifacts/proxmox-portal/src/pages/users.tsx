import { useState } from "react";
import {
  useListUsers,
  useListTenants,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { User, CreateUserBody, UpdateUserBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Users, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    operator: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    viewer: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[role] ?? map.viewer)}>
      {role}
    </span>
  );
}

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
  username: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  password: string;
}

const defaultForm: FormData = { username: "", email: "", fullName: "", role: "viewer", tenantId: "", password: "" };

export default function UsersPage() {
  const { data: users, isLoading } = useListUsers();
  const { data: tenants } = useListTenants();
  const qc = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);

  function openCreate() {
    setForm(defaultForm);
    setCreateOpen(true);
  }

  function openEdit(u: User) {
    setForm({
      username: u.username,
      email: u.email,
      fullName: u.fullName ?? "",
      role: u.role,
      tenantId: u.tenantId ? String(u.tenantId) : "",
      password: "",
    });
    setEditUser(u);
  }

  function handleCreate() {
    const data: CreateUserBody = {
      username: form.username,
      email: form.email,
      fullName: form.fullName || null,
      role: form.role,
      tenantId: form.tenantId ? parseInt(form.tenantId, 10) : null,
      password: form.password,
    };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setCreateOpen(false);
        toast({ title: "User created" });
      },
      onError: () => toast({ title: "Error", description: "Failed to create user.", variant: "destructive" }),
    });
  }

  function handleEdit() {
    if (!editUser) return;
    const data: UpdateUserBody = {
      username: form.username,
      email: form.email,
      fullName: form.fullName || null,
      role: form.role,
      tenantId: form.tenantId ? parseInt(form.tenantId, 10) : null,
      ...(form.password ? { password: form.password } : {}),
    };
    updateMutation.mutate({ id: editUser.id, data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditUser(null);
        toast({ title: "User updated" });
      },
      onError: () => toast({ title: "Error", description: "Failed to update user.", variant: "destructive" }),
    });
  }

  function handleDelete() {
    if (!deleteUser) return;
    deleteMutation.mutate({ id: deleteUser.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDeleteUser(null);
        toast({ title: "User deleted" });
      },
      onError: () => toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" }),
    });
  }

  const UserForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Username</Label>
          <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="jdoe" className="mt-1" />
        </div>
        <div>
          <Label>Full Name</Label>
          <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="John Doe" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" className="mt-1" />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tenant</Label>
          <Select value={form.tenantId || "none"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="No tenant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tenant</SelectItem>
              {tenants?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Password {editUser && <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>}</Label>
          <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="mt-1" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage portal users and their access</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> New User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : users?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No users yet</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">Create first user</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {users?.map(u => (
            <div key={u.id} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                {(u.fullName ?? u.username).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/users/${u.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {u.fullName ?? u.username}
                  </Link>
                  <RoleBadge role={u.role} />
                  <StatusBadge status={u.status} />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {u.tenantName && <span className="text-xs text-muted-foreground">{u.tenantName}</span>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {u.vmCount} VMs
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteUser(u)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
          {UserForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={v => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {UserForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={v => !v && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteUser?.username}</strong>.
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
