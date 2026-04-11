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
import { ShieldCheck, Plus, Trash2, Building2, Users, Check, Monitor, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Tab = "tenants" | "users";

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

  const [activeTab, setActiveTab] = useState<Tab>("tenants");
  const [tenantGrantOpen, setTenantGrantOpen] = useState(false);
  const [userGrantOpen, setUserGrantOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedVmsForTenant, setSelectedVmsForTenant] = useState<Set<number>>(new Set());
  const [selectedVmsForUser, setSelectedVmsForUser] = useState<Set<number>>(new Set());
  const [granting, setGranting] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  function toggleVm(set: Set<number>, vmId: number, setter: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(vmId)) next.delete(vmId);
    else next.add(vmId);
    setter(next);
  }

  function selectAllVms(setter: (s: Set<number>) => void) {
    if (!vms) return;
    setter(new Set(vms.map(v => v.id)));
  }

  function deselectAllVms(setter: (s: Set<number>) => void) {
    setter(new Set());
  }

  async function handleGrantTenant() {
    if (!selectedTenant || selectedVmsForTenant.size === 0) return;
    setGranting(true);
    const tenantId = parseInt(selectedTenant, 10);
    const vmIds = Array.from(selectedVmsForTenant);
    let successCount = 0;
    for (const vmId of vmIds) {
      try {
        await grantTenantMutation.mutateAsync({ data: { tenantId, vmId } });
        successCount++;
      } catch {}
    }
    qc.invalidateQueries({ queryKey: getListTenantVmAccessQueryKey() });
    qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    setTenantGrantOpen(false);
    setGranting(false);
    toast({ title: `Access granted for ${successCount} VM${successCount !== 1 ? "s" : ""}` });
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

  async function handleGrantUser() {
    if (!selectedUser || selectedVmsForUser.size === 0) return;
    setGranting(true);
    const userId = parseInt(selectedUser, 10);
    const vmIds = Array.from(selectedVmsForUser);
    let successCount = 0;
    for (const vmId of vmIds) {
      try {
        await grantUserMutation.mutateAsync({ data: { userId, vmId } });
        successCount++;
      } catch {}
    }
    qc.invalidateQueries({ queryKey: getListUserVmAccessQueryKey() });
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    setUserGrantOpen(false);
    setGranting(false);
    toast({ title: `Access granted for ${successCount} VM${successCount !== 1 ? "s" : ""}` });
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

  const tenantGroups = tenantAccess
    ? Object.entries(
        tenantAccess.reduce<Record<string, typeof tenantAccess>>((g, a) => {
          const key = a.tenantName ?? "Unknown";
          if (!g[key]) g[key] = [];
          g[key].push(a);
          return g;
        }, {})
      ).filter(([name]) => !searchFilter || name.toLowerCase().includes(searchFilter.toLowerCase()))
    : [];

  const userGroups = userAccess
    ? Object.entries(
        userAccess.reduce<Record<string, typeof userAccess>>((g, a) => {
          const key = a.userName ?? "Unknown";
          if (!g[key]) g[key] = [];
          g[key].push(a);
          return g;
        }, {})
      ).filter(([name]) => !searchFilter || name.toLowerCase().includes(searchFilter.toLowerCase()))
    : [];

  const tenantCount = tenantAccess?.length ?? 0;
  const userCount = userAccess?.length ?? 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-olive/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sand" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
            <p className="text-sm text-muted-foreground">Manage VM permissions for tenants and users</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (activeTab === "tenants") {
              setSelectedTenant("");
              setSelectedVmsForTenant(new Set());
              setTenantGrantOpen(true);
            } else {
              setSelectedUser("");
              setSelectedVmsForUser(new Set());
              setUserGrantOpen(true);
            }
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Grant {activeTab === "tenants" ? "Tenant" : "User"} Access
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Tenant Grants</p>
          <p className="text-2xl font-bold text-foreground">{tenantCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">User Grants</p>
          <p className="text-2xl font-bold text-foreground">{userCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Tenants with Access</p>
          <p className="text-2xl font-bold text-foreground">{tenantGroups.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Users with Access</p>
          <p className="text-2xl font-bold text-foreground">{userGroups.length}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4">
          <div className="flex">
            <button
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "tenants"
                  ? "border-olive text-sand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => { setActiveTab("tenants"); setSearchFilter(""); }}
            >
              <Building2 className="w-4 h-4" />
              Tenant Access
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                activeTab === "tenants" ? "bg-olive/20 text-sand" : "bg-muted text-muted-foreground"
              )}>{tenantCount}</span>
            </button>
            <button
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "users"
                  ? "border-olive text-sand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => { setActiveTab("users"); setSearchFilter(""); }}
            >
              <Users className="w-4 h-4" />
              User Access
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                activeTab === "users" ? "bg-olive/20 text-sand" : "bg-muted text-muted-foreground"
              )}>{userCount}</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${activeTab}...`}
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
        </div>

        {activeTab === "tenants" && (
          <>
            {loadingTA ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : tenantGroups.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchFilter ? "No matching tenants" : "No tenant access grants yet"}
                </p>
                {!searchFilter && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => { setSelectedTenant(""); setSelectedVmsForTenant(new Set()); setTenantGrantOpen(true); }}
                  >
                    Grant tenant access
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {tenantGroups.map(([tenantName, entries], idx) => (
                  <div key={tenantName} className={cn(idx > 0 && "border-t border-border")}>
                    <div className="flex items-center gap-3 px-4 py-3 bg-forest/15">
                      <div className="w-7 h-7 rounded bg-olive/20 flex items-center justify-center">
                        <Building2 className="w-3.5 h-3.5 text-sand" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{tenantName}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-olive/20 text-sand">
                        {entries.length} VM{entries.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {entries.map(a => (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-2 pl-14 hover:bg-secondary/30 transition-colors group">
                          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-foreground flex-1">{a.vmName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRevokeTenant(a.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "users" && (
          <>
            {loadingUA ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : userGroups.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchFilter ? "No matching users" : "No user access grants yet"}
                </p>
                {!searchFilter && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => { setSelectedUser(""); setSelectedVmsForUser(new Set()); setUserGrantOpen(true); }}
                  >
                    Grant user access
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {userGroups.map(([userName, entries], idx) => (
                  <div key={userName} className={cn(idx > 0 && "border-t border-border")}>
                    <div className="flex items-center gap-3 px-4 py-3 bg-forest/15">
                      <div className="w-7 h-7 rounded-full bg-olive/20 flex items-center justify-center text-sand text-xs font-bold">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{userName}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-olive/20 text-sand">
                        {entries.length} VM{entries.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {entries.map(a => (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-2 pl-14 hover:bg-secondary/30 transition-colors group">
                          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-foreground flex-1">{a.vmName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRevokeUser(a.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={tenantGrantOpen} onOpenChange={setTenantGrantOpen}>
        <DialogContent className="max-w-md">
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
              <div className="flex items-center justify-between mb-1">
                <Label>Virtual Machines</Label>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => selectAllVms(setSelectedVmsForTenant)}>Select all</button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => deselectAllVms(setSelectedVmsForTenant)}>Clear</button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{selectedVmsForTenant.size} selected</p>
              <div className="border border-border rounded-md max-h-56 overflow-y-auto">
                {vms?.map(v => {
                  const checked = selectedVmsForTenant.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border last:border-0",
                        checked && "bg-primary/5"
                      )}
                      onClick={() => toggleVm(selectedVmsForTenant, v.id, setSelectedVmsForTenant)}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        checked ? "bg-primary border-primary" : "border-muted-foreground"
                      )}>
                        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className="text-foreground truncate">{v.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{v.clusterName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantGrantOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantTenant} disabled={!selectedTenant || selectedVmsForTenant.size === 0 || granting}>
              {granting ? "Granting..." : `Grant Access (${selectedVmsForTenant.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={userGrantOpen} onOpenChange={setUserGrantOpen}>
        <DialogContent className="max-w-md">
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
              <div className="flex items-center justify-between mb-1">
                <Label>Virtual Machines</Label>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => selectAllVms(setSelectedVmsForUser)}>Select all</button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => deselectAllVms(setSelectedVmsForUser)}>Clear</button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{selectedVmsForUser.size} selected</p>
              <div className="border border-border rounded-md max-h-56 overflow-y-auto">
                {vms?.map(v => {
                  const checked = selectedVmsForUser.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border last:border-0",
                        checked && "bg-primary/5"
                      )}
                      onClick={() => toggleVm(selectedVmsForUser, v.id, setSelectedVmsForUser)}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        checked ? "bg-primary border-primary" : "border-muted-foreground"
                      )}>
                        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className="text-foreground truncate">{v.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{v.clusterName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserGrantOpen(false)}>Cancel</Button>
            <Button onClick={handleGrantUser} disabled={!selectedUser || selectedVmsForUser.size === 0 || granting}>
              {granting ? "Granting..." : `Grant Access (${selectedVmsForUser.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
