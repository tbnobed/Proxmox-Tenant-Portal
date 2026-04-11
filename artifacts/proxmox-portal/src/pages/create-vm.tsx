import { useState, useEffect, useCallback } from "react";
import { useListClusters, useListTenants, getListVmsQueryKey, getListClustersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Server, Monitor, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StorageInfo {
  storage: string;
  type: string;
  content: string;
  avail: number;
  total: number;
}

interface TemplateEntry {
  volid: string;
  format: string;
  size: number;
  content: string;
}

interface NetworkBridge {
  iface: string;
  type: string;
  active: number;
  address: string;
  cidr: string;
  bridgePorts: string;
  comments: string;
}

const OS_TYPES = [
  { value: "l26", label: "Linux 6.x/5.x/4.x (l26)" },
  { value: "l24", label: "Linux 2.4 (l24)" },
  { value: "win11", label: "Windows 11/2022/2025" },
  { value: "win10", label: "Windows 10/2016/2019" },
  { value: "win8", label: "Windows 8/8.1/2012" },
  { value: "win7", label: "Windows 7/2008r2" },
  { value: "wxp", label: "Windows XP/2003" },
  { value: "solaris", label: "Solaris" },
  { value: "other", label: "Other" },
];

const BASE = import.meta.env.BASE_URL ?? "/";

async function apiFetch<T>(url: string): Promise<T> {
  const fullUrl = url.startsWith("/") ? `${BASE}${url.slice(1)}` : url;
  const res = await fetch(fullUrl, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function CreateVmPage() {
  const { data: clusters, isLoading: clustersLoading } = useListClusters();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [vmType, setVmType] = useState<"qemu" | "lxc">("qemu");
  const [clusterId, setClusterId] = useState<string>("");
  const [node, setNode] = useState<string>("");
  const [vmid, setVmid] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [sockets, setSockets] = useState<string>("1");
  const [cores, setCores] = useState<string>("2");
  const [vcpus, setVcpus] = useState<string>("");
  const [memory, setMemory] = useState<string>("2048");
  const [balloon, setBalloon] = useState<string>("");
  const [diskSize, setDiskSize] = useState<string>("32");
  const [storage, setStorage] = useState<string>("");
  const [iso, setIso] = useState<string>("");
  const [template, setTemplate] = useState<string>("");
  const [ostype, setOstype] = useState<string>("l26");
  const [bridge, setBridge] = useState<string>("vmbr0");
  const [vlan, setVlan] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [rootPassword, setRootPassword] = useState<string>("");
  const [startAfterCreate, setStartAfterCreate] = useState<boolean>(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [allowedClusterIds, setAllowedClusterIds] = useState<Set<number> | null>(null);

  const { data: tenants } = useListTenants();

  useEffect(() => {
    if (isAdmin || !user?.tenantId) { setAllowedClusterIds(null); return; }
    fetch(`${BASE}api/tenants/${user.tenantId}/clusters`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((grants: any[]) => setAllowedClusterIds(new Set(grants.map(g => g.clusterId))))
      .catch(() => setAllowedClusterIds(new Set()));
  }, [isAdmin, user?.tenantId]);

  const availableClusters = clusters?.filter(c =>
    allowedClusterIds === null ? true : allowedClusterIds.has(c.id)
  ) ?? [];
  const [nodes, setNodes] = useState<string[]>([]);
  const [storages, setStorages] = useState<StorageInfo[]>([]);
  const [isos, setIsos] = useState<TemplateEntry[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [networks, setNetworks] = useState<NetworkBridge[]>([]);

  const [loadingNodes, setLoadingNodes] = useState(false);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [loadingIsos, setLoadingIsos] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingVmid, setLoadingVmid] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!clusterId) { setNodes([]); setNode(""); return; }
    setLoadingNodes(true);
    setLoadingVmid(true);
    Promise.all([
      apiFetch<string[]>(`/api/clusters/${clusterId}/resources/nodes`),
      apiFetch<{ vmid: number }>(`/api/clusters/${clusterId}/nextid`),
    ]).then(([n, id]) => {
      setNodes(n);
      if (n.length > 0 && !node) setNode(n[0]);
      setVmid(String(id.vmid));
    }).catch(e => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }).finally(() => {
      setLoadingNodes(false);
      setLoadingVmid(false);
    });
  }, [clusterId]);

  useEffect(() => {
    if (!clusterId || !node) {
      setStorages([]);
      setNetworks([]);
      setStorage("");
      setBridge("vmbr0");
      return;
    }
    setLoadingStorage(true);
    setLoadingNetworks(true);
    Promise.all([
      apiFetch<StorageInfo[]>(`/api/clusters/${clusterId}/resources/storage?node=${node}`),
      apiFetch<NetworkBridge[]>(`/api/clusters/${clusterId}/resources/networks?node=${node}`),
    ]).then(([s, n]) => {
      setStorages(s);
      setNetworks(n);
      const diskStorages = s.filter(st => st.content.includes("images") || st.content.includes("rootdir"));
      if (diskStorages.length > 0 && !storage) setStorage(diskStorages[0].storage);
      if (n.length > 0) setBridge(n[0].iface);
    }).catch(e => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }).finally(() => {
      setLoadingStorage(false);
      setLoadingNetworks(false);
    });
  }, [clusterId, node]);

  useEffect(() => {
    if (!clusterId || !node || !storage) { setIsos([]); setTemplates([]); return; }

    if (vmType === "qemu") {
      const isoStorage = storages.find(s => s.content.includes("iso"));
      const storageToQuery = isoStorage ? isoStorage.storage : storage;
      setLoadingIsos(true);
      apiFetch<TemplateEntry[]>(`/api/clusters/${clusterId}/resources/isos?node=${node}&storage=${storageToQuery}`)
        .then(setIsos)
        .catch(() => setIsos([]))
        .finally(() => setLoadingIsos(false));
    } else {
      const tmplStorage = storages.find(s => s.content.includes("vztmpl"));
      const storageToQuery = tmplStorage ? tmplStorage.storage : storage;
      setLoadingTemplates(true);
      apiFetch<TemplateEntry[]>(`/api/clusters/${clusterId}/resources/templates?node=${node}&storage=${storageToQuery}`)
        .then(setTemplates)
        .catch(() => setTemplates([]))
        .finally(() => setLoadingTemplates(false));
    }
  }, [clusterId, node, storage, vmType, storages]);

  const diskStorages = storages.filter(st =>
    vmType === "qemu"
      ? st.content.includes("images")
      : st.content.includes("rootdir") || st.content.includes("images")
  );

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  async function handleCreate() {
    if (!clusterId || !node || !vmid || !name || !storage) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (vmType === "lxc" && !template) {
      toast({ title: "Missing template", description: "Please select a container template.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${BASE}api/clusters/${clusterId}/create-vm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: vmType,
          node,
          vmid: parseInt(vmid),
          name,
          cores: parseInt(cores),
          sockets: parseInt(sockets) || 1,
          vcpus: vcpus ? parseInt(vcpus) : undefined,
          memory: parseInt(memory),
          balloon: balloon ? parseInt(balloon) : undefined,
          diskSize: parseInt(diskSize),
          storage,
          iso: vmType === "qemu" && iso && iso !== "__none__" ? iso : undefined,
          template: vmType === "lxc" ? template : undefined,
          ostype: vmType === "qemu" ? ostype : undefined,
          bridge,
          vlan: vlan ? parseInt(vlan) : undefined,
          description: description || undefined,
          rootPassword: vmType === "lxc" && rootPassword ? rootPassword : undefined,
          startAfterCreate,
          tenantId: selectedTenantId && selectedTenantId !== "__none__" ? parseInt(selectedTenantId) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create VM");

      qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
      qc.invalidateQueries({ queryKey: getListClustersQueryKey() });
      toast({
        title: vmType === "qemu" ? "VM created" : "Container created",
        description: `${name} (${vmid}) has been created on ${node}.`,
      });
      setLocation("/vms");
    } catch (e: any) {
      toast({ title: "Creation failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  if (!isAdmin && !user?.tenantId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/vms")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Create Virtual Machine</h1>
          </div>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <Server className="w-10 h-10 text-destructive mx-auto mb-3" />
          <p className="text-foreground font-medium">Tenant Required</p>
          <p className="text-sm text-muted-foreground mt-1">You must be assigned to a tenant before you can create VMs. Contact your administrator.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setLocation("/vms")}>Back to VMs</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/vms")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Create Virtual Machine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Provision a new VM or container on your Proxmox cluster</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setVmType("qemu")}
          className={cn(
            "flex-1 flex items-center gap-3 rounded-lg border p-4 transition-all",
            vmType === "qemu" ? "border-olive bg-olive/10 ring-1 ring-olive/30" : "border-border bg-card hover:border-olive/40"
          )}
        >
          <Monitor className={cn("w-6 h-6", vmType === "qemu" ? "text-sand" : "text-muted-foreground")} />
          <div className="text-left">
            <p className={cn("font-medium text-sm", vmType === "qemu" ? "text-sand" : "text-foreground")}>QEMU Virtual Machine</p>
            <p className="text-xs text-muted-foreground">Full virtualization with KVM</p>
          </div>
        </button>
        <button
          onClick={() => setVmType("lxc")}
          className={cn(
            "flex-1 flex items-center gap-3 rounded-lg border p-4 transition-all",
            vmType === "lxc" ? "border-olive bg-olive/10 ring-1 ring-olive/30" : "border-border bg-card hover:border-olive/40"
          )}
        >
          <Box className={cn("w-6 h-6", vmType === "lxc" ? "text-sand" : "text-muted-foreground")} />
          <div className="text-left">
            <p className={cn("font-medium text-sm", vmType === "lxc" ? "text-sand" : "text-foreground")}>LXC Container</p>
            <p className="text-xs text-muted-foreground">Lightweight OS-level container</p>
          </div>
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Server className="w-4 h-4 text-sand/60" />
            Target
          </h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Cluster <span className="text-red-400">*</span></Label>
            {clustersLoading ? <Skeleton className="h-9 mt-1" /> : (
              <Select value={clusterId} onValueChange={v => { setClusterId(v); setNode(""); setStorage(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select cluster" /></SelectTrigger>
                <SelectContent>
                  {availableClusters.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.host})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Node <span className="text-red-400">*</span></Label>
            {loadingNodes ? <Skeleton className="h-9 mt-1" /> : (
              <Select value={node} onValueChange={v => { setNode(v); setStorage(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select node" /></SelectTrigger>
                <SelectContent>
                  {nodes.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>VM ID <span className="text-red-400">*</span></Label>
            <div className="relative mt-1">
              <Input
                value={vmid}
                onChange={e => setVmid(e.target.value)}
                placeholder="Auto"
                disabled={loadingVmid}
              />
              {loadingVmid && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
          {isAdmin && (
            <div>
              <Label>Assign to Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No tenant (unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No tenant</SelectItem>
                  {tenants?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">General</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{vmType === "qemu" ? "Name" : "Hostname"} <span className="text-red-400">*</span></Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder={vmType === "qemu" ? "my-vm" : "my-container"} />
          </div>
          <div>
            <Label>Description</Label>
            <Input className="mt-1" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          {vmType === "qemu" && (
            <div>
              <Label>OS Type</Label>
              <Select value={ostype} onValueChange={setOstype}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OS_TYPES.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {vmType === "lxc" && (
            <div>
              <Label>Root Password</Label>
              <Input className="mt-1" type="password" value={rootPassword} onChange={e => setRootPassword(e.target.value)} placeholder="Container root password" />
            </div>
          )}
        </div>
      </div>

      {vmType === "qemu" && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">ISO Image</h2>
          </div>
          <div className="p-5">
            {loadingIsos ? (
              <Skeleton className="h-9" />
            ) : isos.length > 0 ? (
              <div>
                <Label>Boot ISO</Label>
                <Select value={iso} onValueChange={setIso}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None (no CD/DVD)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (no CD/DVD)</SelectItem>
                    {isos.map(i => (
                      <SelectItem key={i.volid} value={i.volid}>
                        {i.volid.split("/").pop()} ({formatBytes(i.size)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {!clusterId || !node ? "Select a cluster and node first" : "No ISO images found on this node. Upload ISOs to a storage pool in Proxmox first."}
              </p>
            )}
          </div>
        </div>
      )}

      {vmType === "lxc" && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Template <span className="text-red-400">*</span></h2>
          </div>
          <div className="p-5">
            {loadingTemplates ? (
              <Skeleton className="h-9" />
            ) : templates.length > 0 ? (
              <div>
                <Label>Container Template</Label>
                <Select value={template} onValueChange={setTemplate}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.volid} value={t.volid}>
                        {t.volid.split("/").pop()} ({formatBytes(t.size)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {!clusterId || !node ? "Select a cluster and node first" : "No container templates found. Download templates via Proxmox UI first."}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">CPU</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {vmType === "qemu" && (
            <div>
              <Label>Sockets</Label>
              <Input className="mt-1" type="number" min="1" max="4" value={sockets} onChange={e => setSockets(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Cores <span className="text-red-400">*</span></Label>
            <Input className="mt-1" type="number" min="1" max="128" value={cores} onChange={e => setCores(e.target.value)} />
          </div>
          {vmType === "qemu" && (
            <div>
              <Label>VCPUs <span className="text-xs text-muted-foreground">(hotplug)</span></Label>
              <Input className="mt-1" type="number" min="0" value={vcpus} onChange={e => setVcpus(e.target.value)} placeholder="0 = all" />
            </div>
          )}
        </div>
        {vmType === "qemu" && (
          <div className="px-5 pb-4">
            <p className="text-xs text-muted-foreground">
              Total CPU limit: {(parseInt(sockets) || 1) * (parseInt(cores) || 1)} core(s)
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Memory</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Memory (MiB) <span className="text-red-400">*</span></Label>
            <Input className="mt-1" type="number" min="64" step="256" value={memory} onChange={e => setMemory(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">{(parseInt(memory) / 1024).toFixed(1)} GiB</p>
          </div>
          {vmType === "qemu" && (
            <div>
              <Label>Minimum Memory (Ballooning) <span className="text-xs text-muted-foreground">MiB</span></Label>
              <Input className="mt-1" type="number" min="0" step="256" value={balloon} onChange={e => setBalloon(e.target.value)} placeholder="0 = disabled" />
              <p className="text-xs text-muted-foreground mt-1">Set to 0 to disable ballooning</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {vmType === "qemu" ? "Hard Disk" : "Root Disk"}
          </h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Storage <span className="text-red-400">*</span></Label>
            {loadingStorage ? <Skeleton className="h-9 mt-1" /> : (
              <Select value={storage} onValueChange={setStorage}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select storage" /></SelectTrigger>
                <SelectContent>
                  {diskStorages.map(s => (
                    <SelectItem key={s.storage} value={s.storage}>
                      {s.storage} ({s.type}) — {formatBytes(s.avail)} free
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Disk Size (GiB) <span className="text-red-400">*</span></Label>
            <Input className="mt-1" type="number" min="1" value={diskSize} onChange={e => setDiskSize(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Network</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Bridge <span className="text-red-400">*</span></Label>
            {loadingNetworks ? <Skeleton className="h-9 mt-1" /> : networks.length > 0 ? (
              <Select value={bridge} onValueChange={setBridge}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {networks.map(n => (
                    <SelectItem key={n.iface} value={n.iface}>
                      {n.iface}{n.cidr ? ` (${n.cidr})` : ""}{n.bridgePorts ? ` → ${n.bridgePorts}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input className="mt-1" value={bridge} onChange={e => setBridge(e.target.value)} placeholder="vmbr0" />
            )}
          </div>
          <div>
            <Label>VLAN Tag <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input className="mt-1" type="number" min="1" max="4094" value={vlan} onChange={e => setVlan(e.target.value)} placeholder="No VLAN" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Start after creation</p>
            <p className="text-xs text-muted-foreground">Automatically power on the {vmType === "qemu" ? "VM" : "container"} after it's created</p>
          </div>
          <Switch checked={startAfterCreate} onCheckedChange={setStartAfterCreate} />
        </div>
      </div>

      <div className="rounded-lg border border-olive/30 bg-olive/5 p-5">
        <h3 className="text-sm font-semibold text-sand mb-3">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Type</p>
            <p className="text-foreground font-medium">{vmType === "qemu" ? "QEMU VM" : "LXC Container"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="text-foreground font-medium">{node || "—"} (ID: {vmid || "—"})</p>
          </div>
          <div>
            <p className="text-muted-foreground">CPU</p>
            <p className="text-foreground font-medium">
              {vmType === "qemu" ? `${sockets || 1}s × ${cores}c = ${(parseInt(sockets) || 1) * (parseInt(cores) || 1)} vCPU` : `${cores} core(s)`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Memory</p>
            <p className="text-foreground font-medium">{memory} MiB ({(parseInt(memory) / 1024).toFixed(1)} GiB)</p>
          </div>
          <div>
            <p className="text-muted-foreground">Disk</p>
            <p className="text-foreground font-medium">{diskSize} GiB on {storage || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Network</p>
            <p className="text-foreground font-medium">{bridge}{vlan ? ` (VLAN ${vlan})` : ""}</p>
          </div>
          {vmType === "qemu" && iso && iso !== "__none__" && (
            <div className="col-span-2">
              <p className="text-muted-foreground">ISO</p>
              <p className="text-foreground font-medium truncate">{iso.split("/").pop()}</p>
            </div>
          )}
          {vmType === "lxc" && template && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Template</p>
              <p className="text-foreground font-medium truncate">{template.split("/").pop()}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => setLocation("/vms")}>Cancel</Button>
        <Button
          onClick={handleCreate}
          disabled={creating || !clusterId || !node || !vmid || !name || !storage || (vmType === "lxc" && !template)}
        >
          {creating ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creating...</>
          ) : (
            <>Create {vmType === "qemu" ? "VM" : "Container"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
