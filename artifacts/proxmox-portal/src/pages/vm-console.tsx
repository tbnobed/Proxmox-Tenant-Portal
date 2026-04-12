import { useParams, Link } from "wouter";
import { useGetVm, useVmConsole, useVmAction, getGetVmQueryKey, getListVmsQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Monitor, Loader2, AlertCircle, ExternalLink, Play, Square, RotateCcw, Disc, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL ?? "/";

interface MountedMedia {
  drive: string;
  media: string;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "running" ? "bg-green-500" : status === "stopped" ? "bg-red-500" : "bg-yellow-500";
  return <span className={cn("w-2 h-2 rounded-full inline-block", color)} />;
}

export default function VmConsolePage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: vm, isLoading: vmLoading } = useGetVm(id, { query: { enabled: !!id, refetchInterval: 5000 } });
  const consoleMutation = useVmConsole();
  const actionMutation = useVmAction();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const [media, setMedia] = useState<MountedMedia[]>([]);
  const [ejecting, setEjecting] = useState<string | null>(null);

  const fetchMedia = useCallback(() => {
    if (!id) return;
    fetch(`${BASE}api/vms/${id}/media`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setMedia)
      .catch(() => setMedia([]));
  }, [id]);

  useEffect(() => {
    if (vm?.type === "qemu") fetchMedia();
  }, [vm?.type, fetchMedia]);

  function handleEject(drive: string) {
    if (!confirm(`Eject media from ${drive.toUpperCase()}? The VM will no longer boot from this disc.`)) return;
    setEjecting(drive);
    fetch(`${BASE}api/vms/${id}/media/${drive}/unmount`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          toast({ title: data.message });
          fetchMedia();
        } else {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
      })
      .catch(e => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setEjecting(null));
  }

  useEffect(() => {
    if (!vm || !popupRef.current || popupRef.current.closed) return;
    try {
      popupRef.current.postMessage({ type: "vm-status", status: vm.status }, "*");
    } catch {}
  }, [vm?.status]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== "vm-action-request") return;
      const action = e.data.action;
      if (!["start", "stop", "reboot"].includes(action)) return;

      actionMutation.mutate({ id, data: { action } }, {
        onSuccess: (result) => {
          qc.invalidateQueries({ queryKey: getGetVmQueryKey(id) });
          qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
          toast({ title: result.message });
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.postMessage({ type: "vm-action-result", action, success: true, message: result.message }, "*");
          }
        },
        onError: () => {
          toast({ title: "Action failed", description: `Failed to ${action} VM`, variant: "destructive" });
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.postMessage({ type: "vm-action-result", action, success: false, message: `Failed to ${action} VM` }, "*");
          }
        },
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id, actionMutation, qc, toast]);

  function handleAction(action: string) {
    setActioning(action);
    actionMutation.mutate({ id, data: { action } }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getGetVmQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListVmsQueryKey() });
        toast({ title: result.message });
        setActioning(null);
      },
      onError: () => {
        toast({ title: "Action failed", description: `Failed to ${action} VM`, variant: "destructive" });
        setActioning(null);
      },
    });
  }

  const launchConsole = useCallback(async (mode: "embed" | "tab") => {
    if (!vm || connecting) return;

    setConnecting(true);
    setError(null);

    try {
      const result = await consoleMutation.mutateAsync({ id });
      const base = import.meta.env.BASE_URL || "/";
      const vncTicket = (result as any).vncTicket || "";
      const cacheBust = `_t=${Date.now()}`;
      const baseParams = `token=${result.token}&name=${encodeURIComponent(result.vmName)}&password=${encodeURIComponent(vncTicket)}&vmId=${id}&status=${encodeURIComponent(vm.status)}&${cacheBust}`;
      const embedUrl = `${base}vnc.html?${baseParams}&embed=1`;
      const popupUrl = `${base}vnc.html?${baseParams}`;
      const url = mode === "embed" ? embedUrl : popupUrl;

      if (mode === "tab") {
        const popup = window.open(url, `vnc-${id}`);
        if (popup) {
          popupRef.current = popup;
          const statusInterval = setInterval(() => {
            if (popup.closed) {
              clearInterval(statusInterval);
              popupRef.current = null;
              return;
            }
            if (vm) {
              try {
                popup.postMessage({ type: "vm-status", status: vm.status }, "*");
              } catch {}
            }
          }, 3000);
        }
      } else {
        setIframeUrl(url);
      }

      setConnecting(false);
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || "Failed to get console ticket";
      setError(msg);
      setConnecting(false);
      toast({ title: "Console error", description: msg, variant: "destructive" });
    }
  }, [vm, id, connecting]);

  return (
    <div className="-m-6 md:-m-8 p-4 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <Link href={`/vms/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Console: {vm?.name ?? "..."}
          </h1>
          <p className="text-sm text-muted-foreground">
            {vm ? `VMID ${vm.vmId} on ${vm.node} (${vm.type})` : "Loading..."}
          </p>
        </div>

        {vm && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 mr-2">
              <StatusDot status={vm.status} />
              {vm.status}
            </span>

            {vm.status !== "running" && (
              <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("start")} className="gap-1.5 text-xs">
                <Play className="w-3.5 h-3.5 text-olive" />
                {actioning === "start" ? "Starting..." : "Start"}
              </Button>
            )}
            {vm.status === "running" && (
              <>
                <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("stop")} className="gap-1.5 text-xs">
                  <Square className="w-3.5 h-3.5 text-red-400" />
                  {actioning === "stop" ? "Stopping..." : "Stop"}
                </Button>
                <Button size="sm" variant="outline" disabled={!!actioning} onClick={() => handleAction("reboot")} className="gap-1.5 text-xs">
                  <RotateCcw className="w-3.5 h-3.5 text-sand" />
                  {actioning === "reboot" ? "Rebooting..." : "Reboot"}
                </Button>
              </>
            )}

            {canManage && media.length > 0 && (
              <>
                <div className="w-px h-6 bg-border mx-1" />
                {media.map(m => {
                  const isoMatch = m.media.match(/([^/]+\.iso)/i);
                  const label = isoMatch ? isoMatch[1] : m.drive;
                  return (
                    <Button
                      key={m.drive}
                      size="sm"
                      variant="outline"
                      disabled={!!ejecting}
                      onClick={() => handleEject(m.drive)}
                      className="gap-1.5 text-xs"
                      title={`Eject ${m.media}`}
                    >
                      {ejecting === m.drive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Disc className="w-3.5 h-3.5 text-sand" />
                      )}
                      {ejecting === m.drive ? "Ejecting..." : `Eject ${label}`}
                    </Button>
                  );
                })}
              </>
            )}

            <div className="w-px h-6 bg-border mx-1" />

            {!iframeUrl && !connecting && (
              <>
                <Button size="sm" onClick={() => launchConsole("embed")} disabled={vmLoading || !vm}>
                  <Monitor className="w-4 h-4 mr-1.5" />
                  Open Console
                </Button>
                <Button size="sm" variant="outline" onClick={() => launchConsole("tab")} disabled={vmLoading || !vm}>
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  New Tab
                </Button>
              </>
            )}
            {connecting && (
              <Button size="sm" disabled>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Connecting...
              </Button>
            )}
            {iframeUrl && (
              <>
                <span className="text-xs text-olive flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-olive animate-pulse" />
                  Active
                </span>
                <Button size="sm" variant="outline" onClick={() => launchConsole("tab")}>
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  Pop Out
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIframeUrl(null)}>
                  Close
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-4 flex items-start gap-3 shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Console Error</p>
            <p className="text-sm text-red-300/70 mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => launchConsole("embed")}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {iframeUrl ? (
        <iframe
          src={iframeUrl}
          className="flex-1 min-h-0 rounded-lg border border-border bg-black w-full"
          style={{ minHeight: "500px" }}
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div
          className="flex-1 min-h-0 rounded-lg border border-border bg-black overflow-hidden relative"
          style={{ minHeight: "400px" }}
        >
          {!connecting && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Monitor className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">VM Console</p>
              <p className="text-sm mt-1">Click "Open Console" to start the VNC session</p>
              {vm?.status !== "running" && vm && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-sand mb-2">
                    VM is currently {vm.status}. Start it first for console access.
                  </p>
                  <Button size="sm" onClick={() => handleAction("start")} disabled={!!actioning}>
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    {actioning === "start" ? "Starting..." : "Start VM"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {connecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-12 h-12 animate-spin mb-4 opacity-50" />
              <p className="text-sm">Establishing console connection...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
