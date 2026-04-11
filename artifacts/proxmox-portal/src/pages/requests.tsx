import { useState } from "react";
import {
  useListRequests,
  useCreateRequest,
  useReviewRequest,
  useListVms,
} from "@workspace/api-client-react";
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
  FileText,
  Plus,
  Shield,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const emptyForm = {
  requestType: "firewall",
  priority: "normal",
  vmName: "",
  vmIpAddress: "",
  portNumber: "",
  protocol: "tcp",
  clusterName: "",
  clusterIp: "",
  direction: "",
  sourceNetwork: "",
  domainName: "",
  sslOption: "",
  forwardPort: "",
  description: "",
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof Clock; class: string }> = {
    pending: { icon: Clock, class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    approved: { icon: CheckCircle2, class: "bg-green-500/15 text-green-400 border-green-500/30" },
    denied: { icon: XCircle, class: "bg-red-500/15 text-red-400 border-red-500/30" },
    completed: { icon: CheckCircle2, class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", c.class)}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = priority === "urgent"
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      {priority === "urgent" && <AlertTriangle className="w-3 h-3" />}
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isFirewall = type === "firewall";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
      isFirewall ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-purple-500/15 text-purple-400 border-purple-500/30"
    )}>
      {isFirewall ? <Shield className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
      {isFirewall ? "Firewall" : "Proxy Host"}
    </span>
  );
}

export default function RequestsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const { data: requests, refetch } = useListRequests(
    {
      ...(filterStatus && filterStatus !== "all" ? { status: filterStatus } : {}),
      ...(filterType && filterType !== "all" ? { requestType: filterType } : {}),
    },
  );
  const { data: vms } = useListVms();
  const createMutation = useCreateRequest();
  const reviewMutation = useReviewRequest();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  const [reviewDialog, setReviewDialog] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [completeDialog, setCompleteDialog] = useState<number | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.vmName || !form.vmIpAddress || !form.portNumber || !form.clusterName || !form.clusterIp) {
      toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        data: {
          requestType: form.requestType,
          priority: form.priority,
          vmName: form.vmName,
          vmIpAddress: form.vmIpAddress,
          portNumber: form.portNumber,
          protocol: form.protocol,
          clusterName: form.clusterName,
          clusterIp: form.clusterIp,
          direction: form.direction || null,
          sourceNetwork: form.sourceNetwork || null,
          domainName: form.domainName || null,
          sslOption: form.sslOption || null,
          forwardPort: form.forwardPort || null,
          description: form.description || null,
        },
      });
      toast({ title: "Request submitted", description: "Your infrastructure request has been submitted for review." });
      setForm({ ...emptyForm });
      setShowForm(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to submit request", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(id: number, status: "approved" | "denied") {
    try {
      await reviewMutation.mutateAsync({
        id,
        data: { status, adminNotes: reviewNotes || null },
      });
      toast({ title: `Request ${status}`, description: `The request has been ${status}.` });
      setReviewDialog(null);
      setReviewNotes("");
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Failed to review request", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Infrastructure Requests
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? "Review and manage firewall & proxy host requests" : "Submit and track your firewall & proxy host requests"}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Request
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-lg font-semibold text-foreground">Submit New Request</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Request Type *</Label>
              <Select value={form.requestType} onValueChange={(v) => updateForm("requestType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="firewall">Firewall Rule</SelectItem>
                  <SelectItem value="proxy_host">Proxy Host</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => updateForm("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Protocol *</Label>
              <Select value={form.protocol} onValueChange={(v) => updateForm("protocol", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="both">TCP + UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>VM *</Label>
              <Select
                value={form.vmName}
                onValueChange={(vmName) => {
                  const selectedVm = vms?.find((v) => v.name === vmName);
                  setForm((prev) => ({
                    ...prev,
                    vmName,
                    vmIpAddress: selectedVm?.ipAddress ?? "",
                    clusterName: selectedVm?.clusterName ?? "",
                    clusterIp: selectedVm?.clusterHost ?? "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a VM" /></SelectTrigger>
                <SelectContent>
                  {vms?.map((vm) => (
                    <SelectItem key={vm.id} value={vm.name}>
                      {vm.name} ({vm.clusterName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>VM IP Address *</Label>
              <Input value={form.vmIpAddress} onChange={(e) => updateForm("vmIpAddress", e.target.value)} placeholder="e.g. 10.0.1.50" />
            </div>
            <div className="space-y-1.5">
              <Label>Port Number *</Label>
              <Input value={form.portNumber} onChange={(e) => updateForm("portNumber", e.target.value)} placeholder="e.g. 443 or 8080-8090" />
            </div>
            <div className="space-y-1.5">
              <Label>Cluster Name</Label>
              <Input value={form.clusterName} readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Cluster IP</Label>
              <Input value={form.clusterIp} readOnly className="bg-muted/50" />
            </div>
          </div>

          {form.requestType === "firewall" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
              <h3 className="text-sm font-medium text-blue-400 col-span-full flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Firewall Rule Details
              </h3>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => updateForm("direction", v)}>
                  <SelectTrigger><SelectValue placeholder="Select direction" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source IP / Network</Label>
                <Input value={form.sourceNetwork} onChange={(e) => updateForm("sourceNetwork", e.target.value)} placeholder="e.g. 0.0.0.0/0 or 10.0.0.0/24" />
              </div>
            </div>
          )}

          {form.requestType === "proxy_host" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <h3 className="text-sm font-medium text-purple-400 col-span-full flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                Proxy Host Details
              </h3>
              <div className="space-y-1.5">
                <Label>Domain Name</Label>
                <Input value={form.domainName} onChange={(e) => updateForm("domainName", e.target.value)} placeholder="e.g. app.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>SSL / TLS</Label>
                <Select value={form.sslOption} onValueChange={(v) => updateForm("sslOption", v)}>
                  <SelectTrigger><SelectValue placeholder="Select SSL option" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
                    <SelectItem value="custom">Custom Certificate</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Forward Port</Label>
                <Input value={form.forwardPort} onChange={(e) => updateForm("forwardPort", e.target.value)} placeholder="e.g. 3000" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description / Justification</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              placeholder="Explain why this change is needed..."
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="firewall">Firewall</SelectItem>
            <SelectItem value="proxy_host">Proxy Host</SelectItem>
          </SelectContent>
        </Select>
        {(filterStatus || filterType) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus(""); setFilterType(""); }}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {!requests?.length && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No requests found</p>
            <p className="text-sm mt-1">Click "New Request" to submit your first infrastructure request.</p>
          </div>
        )}

        {requests?.map((req) => (
          <div key={req.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{req.vmName}</span>
                  <TypeBadge type={req.requestType} />
                  <StatusBadge status={req.status} />
                  <PriorityBadge priority={req.priority} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>{req.vmIpAddress}:{req.portNumber}</span>
                  <span>on {req.clusterName}</span>
                  <span>by {req.requestedByName}</span>
                  {req.tenantName && <span>({req.tenantName})</span>}
                  <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && req.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); setReviewDialog(req.id); }}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Review
                  </Button>
                )}
                {isAdmin && req.status === "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    onClick={(e) => { e.stopPropagation(); setCompleteDialog(req.id); }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Mark Complete
                  </Button>
                )}
                {expandedId === req.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {expandedId === req.id && (
              <div className="border-t border-border px-5 py-4 bg-muted/10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">VM Name</span>
                    <p className="font-medium">{req.vmName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">VM IP Address</span>
                    <p className="font-medium">{req.vmIpAddress}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Port</span>
                    <p className="font-medium">{req.portNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Protocol</span>
                    <p className="font-medium uppercase">{req.protocol}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Cluster Name</span>
                    <p className="font-medium">{req.clusterName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Cluster IP</span>
                    <p className="font-medium">{req.clusterIp}</p>
                  </div>

                  {req.requestType === "firewall" && (
                    <>
                      {req.direction && (
                        <div>
                          <span className="text-muted-foreground text-xs">Direction</span>
                          <p className="font-medium capitalize">{req.direction}</p>
                        </div>
                      )}
                      {req.sourceNetwork && (
                        <div>
                          <span className="text-muted-foreground text-xs">Source Network</span>
                          <p className="font-medium">{req.sourceNetwork}</p>
                        </div>
                      )}
                    </>
                  )}

                  {req.requestType === "proxy_host" && (
                    <>
                      {req.domainName && (
                        <div>
                          <span className="text-muted-foreground text-xs">Domain</span>
                          <p className="font-medium">{req.domainName}</p>
                        </div>
                      )}
                      {req.sslOption && (
                        <div>
                          <span className="text-muted-foreground text-xs">SSL</span>
                          <p className="font-medium capitalize">{req.sslOption}</p>
                        </div>
                      )}
                      {req.forwardPort && (
                        <div>
                          <span className="text-muted-foreground text-xs">Forward Port</span>
                          <p className="font-medium">{req.forwardPort}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {req.description && (
                  <div className="mt-4">
                    <span className="text-muted-foreground text-xs">Description / Justification</span>
                    <p className="text-sm mt-1">{req.description}</p>
                  </div>
                )}

                {req.reviewedByName && (
                  <div className="mt-4 p-3 rounded-lg border border-border bg-muted/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Reviewed by <strong className="text-foreground">{req.reviewedByName}</strong></span>
                      {req.reviewedAt && <span>on {new Date(req.reviewedAt).toLocaleString()}</span>}
                    </div>
                    {req.adminNotes && (
                      <p className="text-sm mt-1">{req.adminNotes}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={reviewDialog !== null} onOpenChange={() => { setReviewDialog(null); setReviewNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>Approve or deny this infrastructure request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Admin Notes (optional)</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes or reasons for your decision..."
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => reviewDialog !== null && handleReview(reviewDialog, "approved")}
                disabled={reviewMutation.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={() => reviewDialog !== null && handleReview(reviewDialog, "denied")}
                disabled={reviewMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Deny
              </Button>
              <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNotes(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={completeDialog !== null} onOpenChange={() => { setCompleteDialog(null); setCompleteNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Complete</DialogTitle>
            <DialogDescription>Confirm that this infrastructure change has been implemented.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Completion Notes (optional)</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Any notes about the implementation..."
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="bg-cyan-600 hover:bg-cyan-700"
                onClick={async () => {
                  if (completeDialog === null) return;
                  try {
                    await reviewMutation.mutateAsync({
                      id: completeDialog,
                      data: { status: "completed", adminNotes: completeNotes || null },
                    });
                    toast({ title: "Request completed", description: "The request has been marked as completed and the user has been notified." });
                    setCompleteDialog(null);
                    setCompleteNotes("");
                    refetch();
                  } catch (err: any) {
                    toast({ title: "Error", description: err?.data?.error || "Failed to complete request", variant: "destructive" });
                  }
                }}
                disabled={reviewMutation.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Mark Complete
              </Button>
              <Button variant="outline" onClick={() => { setCompleteDialog(null); setCompleteNotes(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
