import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Monitor,
  Container,
  Copy,
} from "lucide-react";
import { Link } from "wouter";

interface VmTemplate {
  id: number;
  name: string;
  description: string | null;
  type: string;
  cores: number | null;
  sockets: number | null;
  memory: number | null;
  diskSize: number | null;
  ostype: string | null;
  bridge: string | null;
  vlan: number | null;
  balloon: number | null;
  storage: string | null;
  iso: string | null;
  template: string | null;
  createdBy: number | null;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateForm {
  name: string;
  description: string;
  type: string;
  cores: string;
  sockets: string;
  memory: string;
  diskSize: string;
  ostype: string;
  bridge: string;
  vlan: string;
  balloon: string;
  storage: string;
  iso: string;
  template: string;
}

const emptyForm: TemplateForm = {
  name: "",
  description: "",
  type: "qemu",
  cores: "2",
  sockets: "1",
  memory: "2048",
  diskSize: "32",
  ostype: "",
  bridge: "vmbr0",
  vlan: "",
  balloon: "",
  storage: "",
  iso: "",
  template: "",
};

const osTypes = [
  { value: "l26", label: "Linux 2.6+ / 5.x / 6.x" },
  { value: "l24", label: "Linux 2.4" },
  { value: "win11", label: "Windows 11 / 2025" },
  { value: "win10", label: "Windows 10 / 2016 / 2019" },
  { value: "win8", label: "Windows 8 / 2012" },
  { value: "win7", label: "Windows 7 / 2008r2" },
  { value: "wxp", label: "Windows XP / 2003" },
  { value: "solaris", label: "Solaris / OpenSolaris" },
  { value: "other", label: "Other" },
];

function templateToForm(t: VmTemplate): TemplateForm {
  return {
    name: t.name,
    description: t.description ?? "",
    type: t.type,
    cores: t.cores?.toString() ?? "",
    sockets: t.sockets?.toString() ?? "",
    memory: t.memory?.toString() ?? "",
    diskSize: t.diskSize?.toString() ?? "",
    ostype: t.ostype ?? "",
    bridge: t.bridge ?? "vmbr0",
    vlan: t.vlan?.toString() ?? "",
    balloon: t.balloon?.toString() ?? "",
    storage: t.storage ?? "",
    iso: t.iso ?? "",
    template: t.template ?? "",
  };
}

export default function VmTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const base = import.meta.env.BASE_URL || "/";

  const [templates, setTemplates] = useState<VmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${base}api/vm-templates`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch {}
    setLoading(false);
  }, [base]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: VmTemplate) => {
    setEditingId(t.id);
    setForm(templateToForm(t));
    setDialogOpen(true);
  };

  const openDuplicate = (t: VmTemplate) => {
    setEditingId(null);
    setForm({ ...templateToForm(t), name: `${t.name} (copy)` });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        cores: form.cores ? parseInt(form.cores) : null,
        sockets: form.sockets ? parseInt(form.sockets) : null,
        memory: form.memory ? parseInt(form.memory) : null,
        diskSize: form.diskSize ? parseInt(form.diskSize) : null,
        ostype: form.ostype || null,
        bridge: form.bridge || "vmbr0",
        vlan: form.vlan ? parseInt(form.vlan) : null,
        balloon: form.balloon ? parseInt(form.balloon) : null,
        storage: form.storage || null,
        iso: form.iso || null,
        template: form.template || null,
      };

      const url = editingId
        ? `${base}api/vm-templates/${editingId}`
        : `${base}api/vm-templates`;

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast({ title: editingId ? "Template updated" : "Template created" });
        setDialogOpen(false);
        fetchTemplates();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || "Failed to save template", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save template", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`${base}api/vm-templates/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        toast({ title: "Template deleted" });
        fetchTemplates();
      } else {
        toast({ title: "Failed to delete template", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to delete template", variant: "destructive" });
    }
    setDeleteId(null);
  };

  const updateField = (field: keyof TemplateForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">VM Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable configurations for quick VM deployment
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} size="sm" className="bg-olive hover:bg-olive/80 text-white">
            <Plus className="w-4 h-4 mr-1.5" />
            New Template
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Create your first VM template to speed up deployments"
              : "Ask your admin to create VM templates"}
          </p>
          {isAdmin && (
            <Button onClick={openCreate} size="sm" className="mt-4 bg-olive hover:bg-olive/80 text-white">
              <Plus className="w-4 h-4 mr-1.5" />
              Create Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="rounded-lg border border-border bg-card overflow-hidden group">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                {t.type === "qemu" ? (
                  <Monitor className="w-4 h-4 text-sand shrink-0" />
                ) : (
                  <Container className="w-4 h-4 text-sand shrink-0" />
                )}
                <h3 className="text-sm font-semibold text-foreground truncate flex-1">{t.name}</h3>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t.type === "qemu" ? "VM" : "LXC"}
                </Badge>
              </div>

              {t.description && (
                <p className="px-4 pt-2 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              )}

              <div className="px-4 py-3 space-y-1.5">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Cpu className="w-3 h-3 shrink-0" />
                    <span>{t.cores ?? "—"} core{(t.cores ?? 0) !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MemoryStick className="w-3 h-3 shrink-0" />
                    <span>{t.memory ? `${t.memory >= 1024 ? `${(t.memory / 1024).toFixed(1)}G` : `${t.memory}M`}` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <HardDrive className="w-3 h-3 shrink-0" />
                    <span>{t.diskSize ? `${t.diskSize}G` : "—"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Network className="w-3 h-3 shrink-0" />
                  <span>{t.bridge ?? "vmbr0"}{t.vlan ? ` (VLAN ${t.vlan})` : ""}</span>
                </div>
                {t.ostype && (
                  <div className="text-xs text-muted-foreground">
                    OS: {osTypes.find(o => o.value === t.ostype)?.label ?? t.ostype}
                  </div>
                )}
                {t.storage && (
                  <div className="text-xs text-muted-foreground">
                    Storage: {t.storage}
                  </div>
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {t.createdByUsername ? `by ${t.createdByUsername}` : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Link href={`/vms/create?templateId=${t.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-sand hover:text-sand/80">
                      Use Template
                    </Button>
                  </Link>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openDuplicate(t)}
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(t)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => setDeleteId(t.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New VM Template"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the template configuration" : "Define a reusable VM configuration"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Template Name</Label>
                <Input
                  value={form.name}
                  onChange={e => updateField("name", e.target.value)}
                  placeholder="e.g. Ubuntu Web Server"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={e => updateField("description", e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => updateField("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qemu">QEMU (Virtual Machine)</SelectItem>
                    <SelectItem value="lxc">LXC (Container)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === "qemu" && (
                <div>
                  <Label>OS Type</Label>
                  <Select value={form.ostype} onValueChange={v => updateField("ostype", v)}>
                    <SelectTrigger><SelectValue placeholder="Select OS" /></SelectTrigger>
                    <SelectContent>
                      {osTypes.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">COMPUTE</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label>CPU Cores</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.cores}
                    onChange={e => updateField("cores", e.target.value)}
                    placeholder="2"
                  />
                </div>
                {form.type === "qemu" && (
                  <div>
                    <Label>Sockets</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.sockets}
                      onChange={e => updateField("sockets", e.target.value)}
                      placeholder="1"
                    />
                  </div>
                )}
                <div>
                  <Label>Memory (MiB)</Label>
                  <Input
                    type="number"
                    min="128"
                    value={form.memory}
                    onChange={e => updateField("memory", e.target.value)}
                    placeholder="2048"
                  />
                </div>
                {form.type === "qemu" && (
                  <div>
                    <Label>Balloon (MiB)</Label>
                    <Input
                      type="number"
                      value={form.balloon}
                      onChange={e => updateField("balloon", e.target.value)}
                      placeholder="Min memory"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">STORAGE</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Disk Size (GiB)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.diskSize}
                    onChange={e => updateField("diskSize", e.target.value)}
                    placeholder="32"
                  />
                </div>
                <div>
                  <Label>Storage Pool</Label>
                  <Input
                    value={form.storage}
                    onChange={e => updateField("storage", e.target.value)}
                    placeholder="e.g. local-lvm"
                  />
                </div>
                {form.type === "qemu" && (
                  <div className="col-span-2">
                    <Label>ISO Image</Label>
                    <Input
                      value={form.iso}
                      onChange={e => updateField("iso", e.target.value)}
                      placeholder="e.g. local:iso/ubuntu-22.04.iso"
                    />
                  </div>
                )}
                {form.type === "lxc" && (
                  <div className="col-span-2">
                    <Label>Container Template</Label>
                    <Input
                      value={form.template}
                      onChange={e => updateField("template", e.target.value)}
                      placeholder="e.g. local:vztmpl/ubuntu-22.04.tar.zst"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">NETWORK</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bridge</Label>
                  <Input
                    value={form.bridge}
                    onChange={e => updateField("bridge", e.target.value)}
                    placeholder="vmbr0"
                  />
                </div>
                <div>
                  <Label>VLAN Tag</Label>
                  <Input
                    type="number"
                    value={form.vlan}
                    onChange={e => updateField("vlan", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-olive hover:bg-olive/80 text-white">
                {saving ? "Saving..." : editingId ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
