import { useState, useMemo } from "react";
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
import { ShieldCheck, Plus, Trash2, Building2, Users, Check, Search, ChevronRight, ChevronDown, X, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Tab = "tenants" | "users";

interface GroupedTenant {
  tenantId: number;
  tenantName: string;
  vms: { accessId: number; vmId: number; vmName: string }[];
}

interface GroupedUser {
  userId: number;
  userName: string;
  vms: { accessId: number; vmId: number; vmName: string }[];
}

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

  const [tSearch, setTSearch] = useState("");
  const [uSearch, setUSearch] = useState("");

  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  const [revokeConfirm, setRevokeConfirm] = useState<{ type: Tab; entityName: string; accessIds: number[] } | null>(null);

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

  const groupedTenants = useMemo((): GroupedTenant[] => {
    if (!tenantAccess) return [];
    const map = new Map<number, GroupedTenant>();
    for (const row of tenantAccess) {
      if (!map.has(row.tenantId)) {
        map.set(row.tenantId, { tenantId: row.tenantId, tenantName: row.tenantName ?? "Unknown", vms: [] });
      }
      map.get(row.tenantId)!.vms.push({ accessId: row.id, vmId: row.vmId, vmName: row.vmName ?? "Unknown" });
    }
    let groups = Array.from(map.values());
    groups.sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    if (tSearch) {
      const q = tSearch.toLowerCase();
      groups = groups.filter(g =>
        g.tenantName.toLowerCase().includes(q) ||
        g.vms.some(v => v.vmName.toLowerCase().includes(q))
      );
    }
    return groups;
  }, [tenantAccess, tSearch]);

  const groupedUsers = useMemo((): GroupedUser[] => {
    if (!userAccess) return [];
    const map = new Map<number, GroupedUser>();
    for (const row of userAccess) {
      if (!map.has(row.userId)) {
        map.set(row.userId, { userId: row.userId, userName: row.userName ?? "Unknown", vms: [] });
      }
      map.get(row.userId)!.vms.push({ accessId: row.id, vmId: row.vmId, vmName: row.vmName ?? "Unknown" });
    }
    let groups = Array.from(map.values());
    groups.sort((a, b) => a.userName.localeCompare(b.userName));
    if (uSearch) {
      const q = uSearch.toLowerCase();
      groups = groups.filter(g =>
        g.userName.toLowerCase().includes(q) ||
        g.vms.some(v => v.vmName.toLowerCase().includes(q))
      );
    }
    return groups;
  }, [userAccess, uSearch]);

  function toggleExpand(id: number, set: Set<number>, setter: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  async function handleGrantTenant() {
    if (!selectedTenant || selectedVmsForTenant.size === 0) return;
    setGranting(true);
    const tenantId = parseInt(selectedTenant, 10);
    let ok = 0;
    for (const vmId of selectedVmsForTenant) {
      try { await grantTenantMutation.mutateAsync({ data: { tenantId, vmId } }); ok++; } catch {}
    }
    qc.invalidateQueries({ queryKey: getListTenantVmAccessQueryKey() });
    qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    setTenantGrantOpen(false);
    setGranting(false);
    setSelectedVmsForTenant(new Set());
    toast({ title: `Access granted for ${ok} VM${ok !== 1 ? "s" : ""}` });
  }

  async function handleGrantUser() {
    if (!selectedUser || selectedVmsForUser.size === 0) return;
    setGranting(true);
    const userId = parseInt(selectedUser, 10);
    let ok = 0;
    for (const vmId of selectedVmsForUser) {
      try { await grantUserMutation.mutateAsync({ data: { userId, vmId } }); ok++; } catch {}
    }
    qc.invalidateQueries({ queryKey: getListUserVmAccessQueryKey() });
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    setUserGrantOpen(false);
    setGranting(false);
    setSelectedVmsForUser(new Set());
    toast({ title: `Access granted for ${ok} VM${ok !== 1 ? "s" : ""}` });
  }

  function revokeSingle(type: Tab, accessId: number) {
    const mutation = type === "tenants" ? revokeTenantMutation : revokeUserMutation;
    const keys = type === "tenants"
      ? [getListTenantVmAccessQueryKey(), getListTenantsQueryKey()]
      : [getListUserVmAccessQueryKey(), getListUsersQueryKey()];
    mutation.mutate({ id: accessId }, {
      onSuccess: () => { keys.forEach(k => qc.invalidateQueries({ queryKey: k })); toast({ title: "Access revoked" }); },
      onError: () => toast({ title: "Error revoking access", variant: "destructive" }),
    });
  }

  async function handleRevokeAll() {
    if (!revokeConfirm) return;
    const { type, accessIds } = revokeConfirm;
    const mutation = type === "tenants" ? revokeTenantMutation : revokeUserMutation;
    let ok = 0;
    for (const id of accessIds) {
      try {
        await new Promise<void>((resolve, reject) =>
          mutation.mutate({ id }, { onSuccess: () => { ok++; resolve(); }, onError: reject })
        );
      } catch {}
    }
    const keys = type === "tenants"
      ? [getListTenantVmAccessQueryKey(), getListTenantsQueryKey()]
      : [getListUserVmAccessQueryKey(), getListUsersQueryKey()];
    keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
    const failed = accessIds.length - ok;
    setRevokeConfirm(null);
    if (failed > 0) {
      toast({ title: `Revoked ${ok} of ${accessIds.length} grants (${failed} failed)`, variant: "destructive" });
    } else {
      toast({ title: `Revoked ${ok} access grant${ok !== 1 ? "s" : ""}` });
    }
  }

  const totalTenantGrants = tenantAccess?.length ?? 0;
  const totalUserGrants = userAccess?.length ?? 0;

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
      </div>

      <div className="flex gap-2">
        <button
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "tenants" ? "bg-olive/20 text-sand" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
          onClick={() => setActiveTab("tenants")}
        >
          <Building2 className="w-4 h-4" />
          Tenant Access
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{groupedTenants.length}</span>
        </button>
        <button
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "users" ? "bg-olive/20 text-sand" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
          onClick={() => setActiveTab("users")}
        >
          <Users className="w-4 h-4" />
          User Access
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{groupedUsers.length}</span>
        </button>
      </div>

      {activeTab === "tenants" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search tenants or VMs..." value={tSearch} onChange={e => setTSearch(e.target.value)} className="h-8 pl-8 text-xs" />
            </div>
            <span className="text-xs text-muted-foreground">{totalTenantGrants} total grant{totalTenantGrants !== 1 ? "s" : ""}</span>
            <Button size="sm" className="h-8 ml-auto" onClick={() => { setSelectedTenant(""); setSelectedVmsForTenant(new Set()); setTenantGrantOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Grant Access
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {loadingTA ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : groupedTenants.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{tSearch ? "No matching tenants" : "No tenant access grants yet"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {groupedTenants.map(group => {
                  const isExpanded = expandedTenants.has(group.tenantId);
                  return (
                    <div key={group.tenantId}>
                      <div
                        className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                        onClick={() => toggleExpand(group.tenantId, expandedTenants, setExpandedTenants)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <Building2 className="w-4 h-4 text-sand shrink-0" />
                        <span className="text-sm font-medium text-foreground">{group.tenantName}</span>
                        <div className="flex items-center gap-1.5 ml-2">
                          <Monitor className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{group.vms.length} VM{group.vms.length !== 1 ? "s" : ""}</span>
                        </div>
                        {!isExpanded && (
                          <div className="flex flex-wrap gap-1.5 ml-3 flex-1 min-w-0 overflow-hidden max-h-6">
                            {group.vms.slice(0, 6).map(vm => (
                              <span key={vm.accessId} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-olive/10 text-sand/80 border border-olive/20 whitespace-nowrap">
                                {vm.vmName}
                              </span>
                            ))}
                            {group.vms.length > 6 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground whitespace-nowrap">
                                +{group.vms.length - 6} more
                              </span>
                            )}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100 ml-auto shrink-0 hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setRevokeConfirm({ type: "tenants", entityName: group.tenantName, accessIds: group.vms.map(v => v.accessId) }); }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Revoke All
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="bg-secondary/10 border-t border-border">
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-px bg-border/30">
                            {group.vms.map(vm => (
                              <div key={vm.accessId} className="flex items-center justify-between gap-2 px-6 py-2 bg-card hover:bg-secondary/20 transition-colors group/vm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Monitor className="w-3.5 h-3.5 text-sand/60 shrink-0" />
                                  <span className="text-sm text-foreground truncate">{vm.vmName}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 opacity-0 group-hover/vm:opacity-100 transition-opacity shrink-0"
                                  onClick={() => revokeSingle("tenants", vm.accessId)}
                                >
                                  <X className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search users or VMs..." value={uSearch} onChange={e => setUSearch(e.target.value)} className="h-8 pl-8 text-xs" />
            </div>
            <span className="text-xs text-muted-foreground">{totalUserGrants} total grant{totalUserGrants !== 1 ? "s" : ""}</span>
            <Button size="sm" className="h-8 ml-auto" onClick={() => { setSelectedUser(""); setSelectedVmsForUser(new Set()); setUserGrantOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Grant Access
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {loadingUA ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : groupedUsers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{uSearch ? "No matching users" : "No user access grants yet"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {groupedUsers.map(group => {
                  const isExpanded = expandedUsers.has(group.userId);
                  return (
                    <div key={group.userId}>
                      <div
                        className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                        onClick={() => toggleExpand(group.userId, expandedUsers, setExpandedUsers)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="w-6 h-6 rounded-full bg-olive/20 flex items-center justify-center text-sand text-[11px] font-bold shrink-0">
                          {group.userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground">{group.userName}</span>
                        <div className="flex items-center gap-1.5 ml-2">
                          <Monitor className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{group.vms.length} VM{group.vms.length !== 1 ? "s" : ""}</span>
                        </div>
                        {!isExpanded && (
                          <div className="flex flex-wrap gap-1.5 ml-3 flex-1 min-w-0 overflow-hidden max-h-6">
                            {group.vms.slice(0, 6).map(vm => (
                              <span key={vm.accessId} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-olive/10 text-sand/80 border border-olive/20 whitespace-nowrap">
                                {vm.vmName}
                              </span>
                            ))}
                            {group.vms.length > 6 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground whitespace-nowrap">
                                +{group.vms.length - 6} more
                              </span>
                            )}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive opacity-0 group-hover:opacity-100 hover:opacity-100 ml-auto shrink-0 hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setRevokeConfirm({ type: "users", entityName: group.userName, accessIds: group.vms.map(v => v.accessId) }); }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Revoke All
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="bg-secondary/10 border-t border-border">
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-px bg-border/30">
                            {group.vms.map(vm => (
                              <div key={vm.accessId} className="flex items-center justify-between gap-2 px-6 py-2 bg-card hover:bg-secondary/20 transition-colors group/vm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Monitor className="w-3.5 h-3.5 text-sand/60 shrink-0" />
                                  <span className="text-sm text-foreground truncate">{vm.vmName}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 opacity-0 group-hover/vm:opacity-100 transition-opacity shrink-0"
                                  onClick={() => revokeSingle("users", vm.accessId)}
                                >
                                  <X className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!revokeConfirm} onOpenChange={v => !v && setRevokeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke all access for {revokeConfirm?.entityName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {revokeConfirm?.accessIds.length} VM access permission{(revokeConfirm?.accessIds.length ?? 0) !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Revoke All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={tenantGrantOpen} onOpenChange={setTenantGrantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Tenant VM Access</DialogTitle>
            <DialogDescription>Select a tenant and the VMs they should have access to.</DialogDescription>
          </DialogHeader>
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
                  <button type="button" className="text-xs text-sand hover:underline" onClick={() => selectAllVms(setSelectedVmsForTenant)}>Select all</button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => deselectAllVms(setSelectedVmsForTenant)}>Clear</button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{selectedVmsForTenant.size} selected</p>
              <div className="border border-border rounded-md max-h-56 overflow-y-auto">
                {vms?.map(v => {
                  const checked = selectedVmsForTenant.has(v.id);
                  return (
                    <button key={v.id} type="button" className={cn("w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border last:border-0", checked && "bg-olive/10")} onClick={() => toggleVm(selectedVmsForTenant, v.id, setSelectedVmsForTenant)}>
                      <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", checked ? "bg-olive border-olive" : "border-muted-foreground")}>
                        {checked && <Check className="w-3 h-3 text-sand" />}
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
          <DialogHeader>
            <DialogTitle>Grant User VM Access</DialogTitle>
            <DialogDescription>Select a user and the VMs they should have access to.</DialogDescription>
          </DialogHeader>
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
                  <button type="button" className="text-xs text-sand hover:underline" onClick={() => selectAllVms(setSelectedVmsForUser)}>Select all</button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => deselectAllVms(setSelectedVmsForUser)}>Clear</button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{selectedVmsForUser.size} selected</p>
              <div className="border border-border rounded-md max-h-56 overflow-y-auto">
                {vms?.map(v => {
                  const checked = selectedVmsForUser.has(v.id);
                  return (
                    <button key={v.id} type="button" className={cn("w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary/50 transition-colors border-b border-border last:border-0", checked && "bg-olive/10")} onClick={() => toggleVm(selectedVmsForUser, v.id, setSelectedVmsForUser)}>
                      <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", checked ? "bg-olive border-olive" : "border-muted-foreground")}>
                        {checked && <Check className="w-3 h-3 text-sand" />}
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
