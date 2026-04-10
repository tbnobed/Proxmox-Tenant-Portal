import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const normalized = status?.toLowerCase();
  
  if (normalized === "running" || normalized === "online" || normalized === "active") {
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{status}</Badge>;
  }
  if (normalized === "stopped" || normalized === "offline" || normalized === "inactive") {
    return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">{status}</Badge>;
  }
  if (normalized === "paused") {
    return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">{status}</Badge>;
  }
  
  return <Badge variant="outline">{status}</Badge>;
}
