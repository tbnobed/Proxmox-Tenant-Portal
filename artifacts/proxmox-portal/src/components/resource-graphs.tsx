import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Cpu,
  MemoryStick,
  Network,
  HardDrive,
  Loader2,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useVmDetailWebSocket, type VmMetricsUpdate } from "@/hooks/use-websocket";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL ?? "/";

interface RrdDataPoint {
  time: number;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
}

interface ChartDataPoint {
  time: string;
  timestamp: number;
  value1: number;
  value2?: number;
  label1?: string;
  label2?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatBytesPerSec(bytes: number): string {
  return `${formatBytes(bytes)}/s`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(timestamp: number, timeframe: string): string {
  const d = new Date(timestamp * 1000);
  if (timeframe === "hour") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (timeframe === "day") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const TIMEFRAMES = [
  { value: "hour", label: "1H" },
  { value: "day", label: "24H" },
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
];

function MiniChart({
  title,
  icon: Icon,
  data,
  color,
  secondColor,
  formatValue,
  currentValue,
  maxValue,
  label1,
  label2,
}: {
  title: string;
  icon: typeof Cpu;
  data: ChartDataPoint[];
  color: string;
  secondColor?: string;
  formatValue: (v: number) => string;
  currentValue?: string;
  maxValue?: string;
  label1?: string;
  label2?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <div className="text-right">
          {currentValue && (
            <span className="text-sm font-semibold text-foreground">{currentValue}</span>
          )}
          {maxValue && (
            <span className="text-xs text-muted-foreground ml-1">/ {maxValue}</span>
          )}
        </div>
      </div>
      <div className="h-28">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
                {secondColor && (
                  <linearGradient id={`grad2-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={secondColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={secondColor} stopOpacity={0.05} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={45}
                tickFormatter={formatValue}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name: string) => [formatValue(value), name]}
              />
              <Area
                type="monotone"
                dataKey="value1"
                name={label1 ?? title}
                stroke={color}
                fill={`url(#grad-${title})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              {secondColor && (
                <Area
                  type="monotone"
                  dataKey="value2"
                  name={label2 ?? "Out"}
                  stroke={secondColor}
                  fill={`url(#grad2-${title})`}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted-foreground">No data available</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResourceGraphs({ vmId, vmDbId }: { vmId: number; vmDbId: number }) {
  const [timeframe, setTimeframe] = useState("hour");
  const [rrdData, setRrdData] = useState<RrdDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<VmMetricsUpdate | null>(null);
  const [liveHistory, setLiveHistory] = useState<VmMetricsUpdate[]>([]);

  const fetchRrdData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE}api/vms/${vmDbId}/rrddata?timeframe=${timeframe}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setRrdData(data);
        setLiveHistory([]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [vmDbId, timeframe]);

  useEffect(() => {
    fetchRrdData();
  }, [fetchRrdData]);

  const handleMetrics = useCallback((update: VmMetricsUpdate) => {
    setLiveMetrics(update);
    setLiveHistory(prev => [...prev.slice(-120), update]);
  }, []);

  const { connected } = useVmDetailWebSocket(vmDbId, handleMetrics);

  const liveRrdPoints: RrdDataPoint[] = liveHistory.map((m) => ({
    time: Math.floor(m.timestamp / 1000),
    cpu: m.cpu,
    mem: m.mem,
    maxmem: m.maxmem,
    disk: m.disk,
    maxdisk: m.maxdisk,
    netin: m.netin,
    netout: m.netout,
    diskread: m.diskread,
    diskwrite: m.diskwrite,
  }));

  const combinedData = timeframe === "hour" && liveRrdPoints.length > 0
    ? [...rrdData, ...liveRrdPoints]
    : rrdData;

  const cpuData: ChartDataPoint[] = combinedData
    .filter((d) => d.cpu != null)
    .map((d) => ({
      time: formatTime(d.time, timeframe),
      timestamp: d.time,
      value1: d.cpu!,
    }));

  const memData: ChartDataPoint[] = combinedData
    .filter((d) => d.mem != null)
    .map((d) => ({
      time: formatTime(d.time, timeframe),
      timestamp: d.time,
      value1: d.mem!,
    }));

  const netData: ChartDataPoint[] = combinedData
    .filter((d) => d.netin != null || d.netout != null)
    .map((d) => ({
      time: formatTime(d.time, timeframe),
      timestamp: d.time,
      value1: d.netin ?? 0,
      value2: d.netout ?? 0,
    }));

  const diskIoData: ChartDataPoint[] = combinedData
    .filter((d) => d.diskread != null || d.diskwrite != null)
    .map((d) => ({
      time: formatTime(d.time, timeframe),
      timestamp: d.time,
      value1: d.diskread ?? 0,
      value2: d.diskwrite ?? 0,
    }));

  const lastPoint = combinedData[combinedData.length - 1];
  const cpuCurrent = liveMetrics ? formatPercent(liveMetrics.cpu) : lastPoint?.cpu != null ? formatPercent(lastPoint.cpu) : undefined;
  const memCurrent = liveMetrics ? formatBytes(liveMetrics.mem) : lastPoint?.mem != null ? formatBytes(lastPoint.mem) : undefined;
  const memMax = liveMetrics ? formatBytes(liveMetrics.maxmem) : lastPoint?.maxmem != null ? formatBytes(lastPoint.maxmem) : undefined;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading resource metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Resource Monitoring</span>
          </div>
          <span className="text-xs text-muted-foreground">{error}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Resource metrics are not available for this VM. This may happen if the VM is stopped or the cluster is unreachable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Resource Monitoring</h2>
          {connected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-500">
              <Wifi className="w-3 h-3" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded transition-colors",
                timeframe === tf.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <MiniChart
          title="CPU Usage"
          icon={Cpu}
          data={cpuData}
          color="#53561F"
          formatValue={formatPercent}
          currentValue={cpuCurrent}
          label1="CPU"
        />
        <MiniChart
          title="Memory"
          icon={MemoryStick}
          data={memData}
          color="#E6CAA7"
          formatValue={formatBytes}
          currentValue={memCurrent}
          maxValue={memMax}
          label1="Used"
        />
        <MiniChart
          title="Network I/O"
          icon={Network}
          data={netData}
          color="#4ade80"
          secondColor="#60a5fa"
          formatValue={formatBytesPerSec}
          label1="In"
          label2="Out"
        />
        <MiniChart
          title="Disk I/O"
          icon={HardDrive}
          data={diskIoData}
          color="#f97316"
          secondColor="#a855f7"
          formatValue={formatBytesPerSec}
          label1="Read"
          label2="Write"
        />
      </div>
    </div>
  );
}
