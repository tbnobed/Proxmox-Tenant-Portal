export type HealthLevel = "healthy" | "warning" | "critical" | "offline" | "unknown";

export interface HealthResult {
  level: HealthLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
}

const healthMap: Record<HealthLevel, HealthResult> = {
  healthy: {
    level: "healthy",
    label: "Healthy",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    borderColor: "border-emerald-500/30",
    dotColor: "bg-emerald-400",
  },
  warning: {
    level: "warning",
    label: "Warning",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/15",
    borderColor: "border-yellow-500/30",
    dotColor: "bg-yellow-400",
  },
  critical: {
    level: "critical",
    label: "Critical",
    color: "text-red-400",
    bgColor: "bg-red-500/15",
    borderColor: "border-red-500/30",
    dotColor: "bg-red-400",
  },
  offline: {
    level: "offline",
    label: "Offline",
    color: "text-gray-400",
    bgColor: "bg-gray-500/15",
    borderColor: "border-gray-500/30",
    dotColor: "bg-gray-400",
  },
  unknown: {
    level: "unknown",
    label: "Unknown",
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/20",
    dotColor: "bg-gray-500",
  },
};

export function getHealthResult(level: HealthLevel): HealthResult {
  return healthMap[level];
}

export function computeNodeHealth(node: {
  status: string;
  cpuUsage: number;
  memUsed: number;
  memTotal: number;
  rootFsUsed: number;
  rootFsTotal: number;
}): HealthLevel {
  if (node.status !== "online") return "offline";

  const cpu = node.cpuUsage * 100;
  const mem = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 0;
  const disk = node.rootFsTotal > 0 ? (node.rootFsUsed / node.rootFsTotal) * 100 : 0;

  if (cpu > 90 || mem > 95 || disk > 95) return "critical";
  if (cpu > 75 || mem > 80 || disk > 85) return "warning";
  return "healthy";
}

export function computeVmHealth(vm: {
  status: string;
}): HealthLevel {
  if (vm.status === "running") return "healthy";
  if (vm.status === "paused") return "warning";
  if (vm.status === "stopped") return "offline";
  return "unknown";
}

export function aggregateHealth(levels: HealthLevel[]): HealthLevel {
  if (levels.length === 0) return "unknown";
  const priority: HealthLevel[] = ["critical", "offline", "warning", "healthy", "unknown"];
  for (const p of priority) {
    if (levels.includes(p)) return p;
  }
  return "unknown";
}
