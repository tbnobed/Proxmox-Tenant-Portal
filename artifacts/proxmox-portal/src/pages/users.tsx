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
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Users, Monitor, Mail, Loader2, RefreshCw, X, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
    admin: "bg-olive/15 text-sand border-olive/20",
    operator: "bg-navy/40 text-sand border-navy/50",
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

interface FormData {
  username: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  password: string;
}

const defaultForm: FormData = { username: "", email: "", fullName: "", role: "viewer", tenantId: "", password: "" };

interface Invite {
  id: number;
  email: string;
  role: string;
  tenantId: number | null;
  tenantName: string | null;
  invitedBy: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

const BASE = import.meta.env.BASE_URL || "/";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "viewer", tenantId: "" });
  const [invitesExpanded, setInvitesExpanded] = useState(true);
  const [revokeInvite, setRevokeInvite] = useState<Invite | null>(null);

  const { data: invites, isLoading: invitesLoading } = useQuery<Invite[]>({
    queryKey: ["invites"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/invites`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invites");
      return res.json();
    },
    enabled: isAdmin,
  });

  const resendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/invites/${id}/resend`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to resend invite");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast({
        title: "Invite resent",
        description: data.emailSent ? `Reminder email sent to ${data.email}` : `Invite refreshed for ${data.email} (email delivery pending)`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}api/invites/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke invite");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setRevokeInvite(null);
      toast({ title: "Invite revoked" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke invite.", variant: "destructive" });
    },
  });

  const pendingInvites = invites?.filter(i => !i.used) ?? [];
  const acceptedInvites = invites?.filter(i => i.used) ?? [];

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string; tenantId: number | null }) => {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}api/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setInviteOpen(false);
      setInviteForm({ email: "", role: "viewer", tenantId: "" });
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast({
        title: "Invite sent",
        description: data.emailSent ? `Invitation email sent to ${data.email}` : `Invite created for ${data.email} (email delivery pending)`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Username</Label>
          <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="jdoe" className="mt-1" />
        </div>
        <div>
          <Label>Full Name</Label>
          <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="John Doe" className="mt-1" />
        </div>
        <div className="sm:col-span-2">
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
        <div className="sm:col-span-2">
          <Label>Password {editUser && <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>}</Label>
          <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="mt-1" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage portal users and their access</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setInviteOpen(true)} size="sm" variant="outline">
            <Mail className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Invite User</span>
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">New User</span>
          </Button>
        </div>
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
            <div key={u.id} className="rounded-lg border border-border bg-card p-3 sm:p-4 flex items-start gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                {(u.fullName ?? u.username).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Link href={`/users/${u.id}`} className="font-medium text-foreground hover:text-primary transition-colors truncate">
                      {u.fullName ?? u.username}
                    </Link>
                    <RoleBadge role={u.role} />
                    <StatusBadge status={u.status} />
                  </div>
                  <div className="flex items-center shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteUser(u)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  {u.tenantName && <span className="text-xs text-muted-foreground">{u.tenantName}</span>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {u.vmCount} VMs
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <button
            onClick={() => setInvitesExpanded(!invitesExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-sand" />
              <h2 className="text-sm font-semibold text-foreground">Pending Invites</h2>
              {pendingInvites.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-olive/20 text-sand border border-olive/30 font-medium">
                  {pendingInvites.length}
                </span>
              )}
            </div>
            {invitesExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {invitesExpanded && (
            <div className="border-t border-border">
              {invitesLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : pendingInvites.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No pending invites</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pendingInvites.map(inv => {
                    const isExpired = inv.expired;
                    return (
                      <div key={inv.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-olive/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-olive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">{inv.email}</span>
                            <RoleBadge role={inv.role} />
                            {isExpired ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" /> expired
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-yellow-500/10 text-yellow-500 border-yellow-500/20 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" /> pending
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            {inv.tenantName && <span>{inv.tenantName}</span>}
                            <span>Invited by {inv.invitedBy}</span>
                            <span>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => resendMutation.mutate(inv.id)}
                            disabled={resendMutation.isPending}
                            title="Resend invite"
                          >
                            {resendMutation.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setRevokeInvite(inv)}
                            title="Revoke invite"
                          >
                            <X className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {acceptedInvites.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-4 py-2 bg-secondary/20">
                    <p className="text-xs text-muted-foreground font-medium">Accepted ({acceptedInvites.length})</p>
                  </div>
                  <div className="divide-y divide-border">
                    {acceptedInvites.slice(0, 5).map(inv => (
                      <div key={inv.id} className="px-4 py-2.5 flex items-center gap-3">
                        <CheckCircle2 className="w-3.5 h-3.5 text-olive shrink-0" />
                        <span className="text-sm text-muted-foreground truncate">{inv.email}</span>
                        <RoleBadge role={inv.role} />
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {acceptedInvites.length > 5 && (
                      <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                        +{acceptedInvites.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!revokeInvite} onOpenChange={v => !v && setRevokeInvite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invite?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the invitation to <strong>{revokeInvite?.email}</strong>. The invite link will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeInvite && revokeMutation.mutate(revokeInvite.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" /> Invite User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send an email invitation. The user will create their own username and password.
            </p>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={inviteForm.role} onValueChange={v => setInviteForm(f => ({ ...f, role: v }))}>
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
                <Select value={inviteForm.tenantId || "none"} onValueChange={v => setInviteForm(f => ({ ...f, tenantId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No tenant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tenant</SelectItem>
                    {tenants?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => inviteMutation.mutate({
                email: inviteForm.email,
                role: inviteForm.role,
                tenantId: inviteForm.tenantId ? parseInt(inviteForm.tenantId, 10) : null,
              })}
              disabled={inviteMutation.isPending || !inviteForm.email}
            >
              {inviteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending...</>
              ) : (
                <><Mail className="w-4 h-4 mr-1.5" /> Send Invite</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
