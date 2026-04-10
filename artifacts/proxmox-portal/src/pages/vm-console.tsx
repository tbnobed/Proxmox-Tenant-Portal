import { useParams, Link } from "wouter";
import { useGetVm, useVmConsole } from "@workspace/api-client-react";
import { ArrowLeft, Monitor, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";

export default function VmConsolePage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const { data: vm, isLoading: vmLoading } = useGetVm(id, { query: { enabled: !!id } });
  const consoleMutation = useVmConsole();
  const { toast } = useToast();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const launchConsole = useCallback(async (mode: "embed" | "tab") => {
    if (!vm || connecting) return;

    setConnecting(true);
    setError(null);

    try {
      const result = await consoleMutation.mutateAsync({ id });
      const base = import.meta.env.BASE_URL || "/";
      const url = `${base}vnc.html?token=${result.token}&name=${encodeURIComponent(result.vmName)}`;

      if (mode === "tab") {
        window.open(url, `vnc-${id}`, "noopener");
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
    <div className="p-6 md:p-8 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Link href={`/vms/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Console: {vm?.name ?? "..."}
          </h1>
          <p className="text-sm text-muted-foreground">
            {vm ? `VMID ${vm.vmId} on ${vm.node} (${vm.type})` : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Active
              </span>
              <Button size="sm" variant="outline" onClick={() => launchConsole("tab")}>
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Pop Out
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setIframeUrl(null);
              }}>
                Close
              </Button>
            </div>
          )}
        </div>
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
                <p className="text-sm text-yellow-400 mt-3">
                  Note: VM is currently {vm.status}. Start it first for console access.
                </p>
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
