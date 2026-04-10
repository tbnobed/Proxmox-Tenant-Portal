import { useState } from "react";
import {
  useListTenantVmAccess,
  useListUserVmAccess,
  useGrantTenantVmAccess,
  useRevokeTenantVmAccess,
  useGrantUserVmAccess,
  useRevokeUserVmAccess,
  useListTenants,
  useListUsers,
  useListVms,
  getListTenantVmAccessQueryKey,
  getListUserVmAccessQueryKey,
  getListTenantsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, Trash2, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function AccessPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tenantAccess, isLoading: loadingTA } = useListTenantVmAccess();
  const { data: userAccess, isLoading: loadingUA } = useListUserVmAccess();
  const { data: tenants } = useListTenants();
  const { data: users } = useListUsers();
  const { data: vms } = useListVms({});
  const grantTenantMutation = useGrantTenantVmAccess();
  const revokeTenantMutation = useRevokeTenantVmAccess();
  const grantUserMutation = useGrantUserVmAccess();
  const revokeUserMutation = useRevokeUserVmAccess();

  const [tenantGrantOpen, setTenantGrantOpen] = useState(false);
  const [userGrantOpen, setUserGrantOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedVmForTenant, setSelectedVmForTenant] = useState("");
  const [selectedVmForUser, setSelectedVmForUser] = useState("");

  function handleGrantTenant() {
    if (!selectedTenant || !selectedVmForTenant) return;
    grantTenantMutation.mutate({ data: { tenantId: parseInt(selectedTenant, 10), vmId: parseInt(selectedVmForTenant, 10) } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantVmAccessQueryKey() });
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setTenantGrantOpen(false);
        toast({ title: "Access granted" });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  function handleRevokeTenant(id: number) {
    revokeTenantMutation.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTenantVmAccessQueryKey() });
        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        toast({ title: "Access revoked" });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  function handleGrantUser() {
    if (!selectedUser || !selectedVmForUser) return;
    grantUserMutation.mutate({ data: { userId: parseInt(selectedUser, 10), vmId: parseInt(selectedVmForUser, 10) } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUserVmAccessQueryKey() });
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setUserGrantOpen(false);
        toast({ title: "Access granted" });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  function handleRevokeUser(id: number) {
    revokeUserMutation.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUserVmAccessQueryKey() });
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Access revoked" });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Grant and revoke VM access for tenants and users</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Tenant Access */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-foreground">Tenant Access</h2>
              <span className="text-xs text-muted-foreground">{tenantAccess?.length ?? 0}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setSelectedTenant(""); setSelectedVmForTenant(""); setTenantGrantOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Grant
            </Button>
          </div>
          {loadingTA ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !tenantAccess || tenantAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No tenant access grants</p>
          ) : (
            <div className="divide-y divide-border">
              {tenantAccess.map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.tenantName}</p>
                    <p className="text-xs text-muted-foreground">{a.vmName}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRevokeTenant(a.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Access */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground">User Access</h2>
              <span className="text-xs text-muted-foreground">{userAccess?.length ?? 0}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setSelectedUser(""); setSelectedVmForUser(""); setUserGrantOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Grant
            </Button>
          </div>
          {loadingUA ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !userAccess || userAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No user access grants</p>
          ) : (
            <div className="divide-y divide-border">
              {userAccess.map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.userName}</p>
                    <p className="text-xs text-muted-foreground">{a.vmName}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRevokeUser(a.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grant Tenant Dialog */}
      <Dialog open={tenantGrantOpen} onOpenChange={setTenantGrantOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grant Tenant VM Access</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tenant</Label>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Virtual Machine</Label>
              <Select value={selectedVmForTenant} onValueChange={setSelectedVmForTenant}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select VM" /></SelectTrigger>
                <SelectContent>
                  {vms?.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name} ({v.clusterName})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantGrantOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantTenant} disabled={!selectedTenant || !selectedVmForTenant || grantTenantMutation.isPending}>
              {grantTenantMutation.isPending ? "Granting..." : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant User Dialog */}
      <Dialog open={userGrantOpen} onOpenChange={setUserGrantOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grant User VM Access</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {users?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullName ?? u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Virtual Machine</Label>
              <Select value={selectedVmForUser} onValueChange={setSelectedVmForUser}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select VM" /></SelectTrigger>
                <SelectContent>
                  {vms?.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name} ({v.clusterName})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserGrantOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantUser} disabled={!selectedUser || !selectedVmForUser || grantUserMutation.isPending}>
              {grantUserMutation.isPending ? "Granting..." : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
