import { useEffect, useRef, useCallback, useState } from "react";

const BASE = import.meta.env.BASE_URL ?? "/";

export interface VmStatusUpdate {
  id: number;
  vmId: number;
  status: string;
  name: string;
}

export interface VmMetricsUpdate {
  id: number;
  vmId: number;
  status: string;
  cpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  netin: number;
  netout: number;
  diskread: number;
  diskwrite: number;
  uptime: number;
  timestamp: number;
}

export interface VmListItem {
  id: number;
  vmId: number;
  name: string;
  status: string;
  node: string;
  type: string;
}

type MessageHandler = (msg: any) => void;

let sharedWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<MessageHandler>();
let connectionState: "connecting" | "connected" | "disconnected" = "disconnected";

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = BASE.endsWith("/") ? BASE : BASE + "/";
  return `${proto}//${window.location.host}${basePath}api/ws`;
}

function connectShared() {
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  connectionState = "connecting";
  const ws = new WebSocket(getWsUrl());
  sharedWs = ws;

  ws.onopen = () => {
    connectionState = "connected";
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    for (const listener of listeners) {
      listener({ type: "connection-status", status: "connected" });
    }
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      for (const listener of listeners) {
        listener(msg);
      }
    } catch {}
  };

  ws.onclose = () => {
    connectionState = "disconnected";
    sharedWs = null;
    for (const listener of listeners) {
      listener({ type: "connection-status", status: "disconnected" });
    }
    scheduleReconnect();
  };

  ws.onerror = () => {
    connectionState = "disconnected";
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (listeners.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (listeners.size > 0) {
      connectShared();
    }
  }, 3000);
}

function sendMessage(msg: any) {
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify(msg));
  }
}

export function useVmListWebSocket(
  onStatusChange?: (update: VmStatusUpdate) => void,
  onListUpdate?: (vms: VmListItem[]) => void,
) {
  const [connected, setConnected] = useState(connectionState === "connected");
  const statusRef = useRef(onStatusChange);
  const listRef = useRef(onListUpdate);
  statusRef.current = onStatusChange;
  listRef.current = onListUpdate;

  useEffect(() => {
    const handler: MessageHandler = (msg) => {
      if (msg.type === "connection-status") {
        setConnected(msg.status === "connected");
        if (msg.status === "connected") {
          sendMessage({ type: "subscribe:vm-list" });
        }
        return;
      }
      if (msg.type === "vm-status") {
        statusRef.current?.(msg.data);
      }
      if (msg.type === "vm-list" && msg.data) {
        listRef.current?.(msg.data);
        statusRef.current?.({ id: 0, vmId: 0, status: "", name: "" });
      }
    };

    listeners.add(handler);
    connectShared();

    if (connectionState === "connected") {
      sendMessage({ type: "subscribe:vm-list" });
    }

    return () => {
      listeners.delete(handler);
      if (listeners.size === 0 && sharedWs) {
        sendMessage({ type: "unsubscribe:vm-list" });
      }
    };
  }, []);

  return { connected };
}

export function useVmDetailWebSocket(
  vmDbId: number | undefined,
  onMetrics?: (update: VmMetricsUpdate) => void,
  onStatusChange?: (update: VmStatusUpdate) => void,
) {
  const [connected, setConnected] = useState(connectionState === "connected");
  const metricsRef = useRef(onMetrics);
  const statusRef = useRef(onStatusChange);
  metricsRef.current = onMetrics;
  statusRef.current = onStatusChange;

  useEffect(() => {
    if (vmDbId == null) return;

    const handler: MessageHandler = (msg) => {
      if (msg.type === "connection-status") {
        setConnected(msg.status === "connected");
        if (msg.status === "connected") {
          sendMessage({ type: "subscribe:vm", vmId: vmDbId });
        }
        return;
      }
      if (msg.type === "vm-metrics" && msg.data?.id === vmDbId) {
        metricsRef.current?.(msg.data);
      }
      if (msg.type === "vm-status" && msg.data?.id === vmDbId) {
        statusRef.current?.(msg.data);
      }
    };

    listeners.add(handler);
    connectShared();

    if (connectionState === "connected") {
      sendMessage({ type: "subscribe:vm", vmId: vmDbId });
    }

    return () => {
      if (connectionState === "connected") {
        sendMessage({ type: "unsubscribe:vm", vmId: vmDbId });
      }
      listeners.delete(handler);
    };
  }, [vmDbId]);

  return { connected };
}
