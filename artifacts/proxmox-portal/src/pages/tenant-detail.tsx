import { useParams, Link } from "wouter";
import { useGetTenant, useGetTenantSummary, useListUsers, useListTenantVmAccess, useListVms, useListClusters } from "@workspace/api-client-react";
import { ArrowLeft, Users, Monitor, ShieldCheck, Building2, Gauge, Server, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string) => `${BASE}api${path}`;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-olive/20 text-sand border-olive/30",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    paused: "bg-navy/40 text-sand border-navy/50",
    active: "bg-olive/20 text-sand border-olive/30",
    inactive: "bg-muted text-muted-foreground border-border",
    admin: "bg-olive/15 text-sand border-olive/20",
    operator: "bg-navy/40 text-sand border-navy/50",
    viewer: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", map[status] ?? map.active)}>
      {status}
    </span>
  );
}

function QuotaBar({ used, max, label, unit }: { used: number; max: number | null; label: string; unit: string }) {
  if (!max) return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{used} {unit} (no limit)</span>
    </div>
  );
  const pct = Math.min((used / max) * 100, 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-yellow-500" : "bg-olive";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{used} / {max} {unit}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface QuotaData {
  limits: {
    maxVms: number | null;
    maxCpusTotal: number | null;
    maxMemoryMbTotal: number | null;
    maxDiskGbTotal: number | null;
    maxCpusPerVm: number | null;
    maxMemoryMbPerVm: number | null;
    maxDiskGbPerVm: number | null;
  };
  usage: {
    vmCount: number;
    cpus: number;
    memoryMb: number;
    diskGb: number;
  };
}

interface ClusterGrant {
  id: number;
  tenantId: number;
  clusterId: number;
  clusterName: string;
  clusterHost: string;
  clusterStatus: string;
  grantedAt: string;
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: tenant, isLoading } = useGetTenant(id, { query: { enabled: !!id } });
  const { data: summary } = useGetTenantSummary(id, { query: { enabled: !!id } });
  const { data: allUsers } = useListUsers();
  const { data: tenantVmAccess } = useListTenantVmAccess();
  const { data: vms } = useListVms();
  const { data: clusters } = useListClusters();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [clusterGrants, setClusterGrants] = useState<ClusterGrant[]>([]);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addClusterId, setAddClusterId] = useState("");

  const [form, setForm] = useState({
    maxVms: "",
    maxCpusTotal: "",
    maxMemoryMbTotal: "",
    maxDiskGbTotal: "",
    maxCpusPerVm: "",
    maxMemoryMbPerVm: "",
    maxDiskGbPerVm: "",
  });

  const fetchQuotas = useCallback(async () => {
    if (!id) return;
    setQuotaLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        fetch(api(`/tenants/${id}/quotas`), { credentials: "include" }),
        fetch(api(`/tenants/${id}/clusters`), { credentials: "include" }),
      ]);
      if (qRes.ok) {
        const data = await qRes.json();
        setQuotaData(data);
        setForm({
          maxVms: data.limits.maxVms?.toString() ?? "",
          maxCpusTotal: data.limits.maxCpusTotal?.toString() ?? "",
          maxMemoryMbTotal: data.limits.maxMemoryMbTotal?.toString() ?? "",
          maxDiskGbTotal: data.limits.maxDiskGbTotal?.toString() ?? "",
          maxCpusPerVm: data.limits.maxCpusPerVm?.toString() ?? "",
          maxMemoryMbPerVm: data.limits.maxMemoryMbPerVm?.toString() ?? "",
          maxDiskGbPerVm: data.limits.maxDiskGbPerVm?.toString() ?? "",
        });
      }
      if (cRes.ok) setClusterGrants(await cRes.json());
    } catch {}
    setQuotaLoading(false);
  }, [id]);

  useEffect(() => { fetchQuotas(); }, [fetchQuotas]);

  const saveQuotas = async () => {
    setSaving(true);
    try {
      const body: Record<string, number | null> = {};
      for (const [key, val] of Object.entries(form)) {
        body[key] = val === "" ? null : parseInt(val, 10);
      }
      const res = await fetch(api(`/tenants/${id}/quotas`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "Quotas updated" });
        fetchQuotas();
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    setSaving(false);
  };

  const addCluster = async () => {
    if (!addClusterId) return;
    const res = await fetch(api(`/tenants/${id}/clusters`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ clusterId: parseInt(addClusterId, 10) }),
    });
    if (res.ok) {
      toast({ title: "Cluster access granted" });
      setAddClusterId("");
      fetchQuotas();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
    }
  };

  const revokeCluster = async (grantId: number) => {
    const res = await fetch(api(`/tenants/${id}/clusters/${grantId}`), {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: "Cluster access revoked" });
      fetchQuotas();
    }
  };

  const tenantUsers = allUsers?.filter(u => u.tenantId === id) ?? [];
  const accessGrants = tenantVmAccess?.filter(a => a.tenantId === id) ?? [];

  const vmMap = useMemo(() => {
    if (!vms) return new Map();
    return new Map(vms.map(v => [v.id, v]));
  }, [vms]);

  const grantedClusterIds = new Set(clusterGrants.map(g => g.clusterId));
  const availableClusters = (clusters ?? []).filter(c => !grantedClusterIds.has(c.id));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tenants" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-forest/40 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-sand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">{tenant?.name}</h1>
                {tenant?.status && <StatusBadge status={tenant.status} />}
              </div>
              {tenant?.description && <p className="text-sm text-muted-foreground mt-0.5">{tenant.description}</p>}
              {tenant?.contactEmail && <p className="text-xs text-muted-foreground mt-0.5">{tenant.contactEmail}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Accessible VMs</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalVms ?? accessGrants.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold text-olive mt-1">{summary?.runningVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Stopped</p>
          <p className="text-2xl font-bold text-muted-foreground mt-1">{summary?.stoppedVms ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Users</p>
          <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalUsers ?? tenantUsers.length}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Gauge className="w-4 h-4 text-sand" />
            <h2 className="text-sm font-semibold text-foreground">Resource Quotas</h2>
          </div>
          {quotaLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : quotaData ? (
            <div className="p-4 space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-sand uppercase tracking-wide">Current Usage</p>
                <QuotaBar used={quotaData.usage.vmCount} max={quotaData.limits.maxVms} label="VMs" unit="VMs" />
                <QuotaBar used={quotaData.usage.cpus} max={quotaData.limits.maxCpusTotal} label="Total CPUs" unit="vCPUs" />
                <QuotaBar used={quotaData.usage.memoryMb} max={quotaData.limits.maxMemoryMbTotal} label="Total Memory" unit="MB" />
                <QuotaBar used={quotaData.usage.diskGb} max={quotaData.limits.maxDiskGbTotal} label="Total Disk" unit="GB" />
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-sand uppercase tracking-wide">Tenant Limits</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Max VMs</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxVms}
                      onChange={e => setForm(f => ({ ...f, maxVms: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total CPUs</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxCpusTotal}
                      onChange={e => setForm(f => ({ ...f, maxCpusTotal: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Memory (MB)</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxMemoryMbTotal}
                      onChange={e => setForm(f => ({ ...f, maxMemoryMbTotal: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Disk (GB)</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxDiskGbTotal}
                      onChange={e => setForm(f => ({ ...f, maxDiskGbTotal: e.target.value }))} className="h-8 text-sm" />
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-sand uppercase tracking-wide">Per-VM Limits</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">CPUs / VM</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxCpusPerVm}
                      onChange={e => setForm(f => ({ ...f, maxCpusPerVm: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Memory / VM (MB)</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxMemoryMbPerVm}
                      onChange={e => setForm(f => ({ ...f, maxMemoryMbPerVm: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Disk / VM (GB)</Label>
                    <Input type="number" min={0} placeholder="No limit" value={form.maxDiskGbPerVm}
                      onChange={e => setForm(f => ({ ...f, maxDiskGbPerVm: e.target.value }))} className="h-8 text-sm" />
                  </div>
                </div>
              </div>
              <Button onClick={saveQuotas} disabled={saving} size="sm" className="w-full bg-olive hover:bg-olive/80 text-white">
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
                Save Quotas
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground p-4 text-center">Unable to load quotas</p>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Server className="w-4 h-4 text-sand" />
              <h2 className="text-sm font-semibold text-foreground">Cluster Access</h2>
              <span className="text-xs text-muted-foreground ml-auto">{clusterGrants.length}</span>
            </div>
            {clusterGrants.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">No clusters assigned</p>
            ) : (
              <div className="divide-y divide-border">
                {clusterGrants.map(g => (
                  <div key={g.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{g.clusterName}</p>
                      <p className="text-xs text-muted-foreground">{g.clusterHost}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={g.clusterStatus} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                        onClick={() => revokeCluster(g.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {availableClusters.length > 0 && (
              <div className="px-4 py-3 border-t border-border flex gap-2">
                <Select value={addClusterId} onValueChange={setAddClusterId}>
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Select cluster..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClusters.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addCluster} size="sm" disabled={!addClusterId} className="h-8 bg-olive hover:bg-olive/80 text-white">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Users className="w-4 h-4 text-sand" />
              <h2 className="text-sm font-semibold text-foreground">Users</h2>
              <span className="text-xs text-muted-foreground ml-auto">{tenantUsers.length}</span>
            </div>
            {tenantUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">No users in this tenant</p>
            ) : (
              <div className="divide-y divide-border">
                {tenantUsers.map(u => (
                  <Link key={u.id} href={`/users/${u.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.fullName ?? u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <StatusBadge status={u.role} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <ShieldCheck className="w-4 h-4 text-sand" />
          <h2 className="text-sm font-semibold text-foreground">Accessible VMs</h2>
          <span className="text-xs text-muted-foreground ml-auto">{accessGrants.length}</span>
        </div>
        {accessGrants.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">No VM access granted</p>
            <Link href="/access" className="text-xs text-sand hover:underline mt-1 inline-block">Grant access</Link>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {accessGrants.map(grant => {
                const vm = vmMap.get(grant.vmId);
                return (
                  <Link key={grant.id} href={vm ? `/vms/${vm.id}` : "#"} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Monitor className="w-3.5 h-3.5 text-sand/60 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{grant.vmName}</p>
                        {vm && <p className="text-xs text-muted-foreground">{vm.clusterName} — Node: {vm.node}</p>}
                      </div>
                    </div>
                    {vm ? (
                      <StatusBadge status={vm.status} />
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded border bg-olive/10 text-sand/80 border-olive/20">granted</span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t border-border">
              <Link href="/access" className="text-xs text-sand hover:underline">Manage access grants</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
