import https from "node:https";
import http from "node:http";

export interface ProxmoxAuth {
  ticket: string;
  csrfToken: string;
}

interface ProxmoxNode {
  node: string;
  status: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
}

interface ProxmoxVmEntry {
  vmid: number;
  name?: string;
  status: string;
  maxcpu?: number;
  maxmem?: number;
  maxdisk?: number;
  netin?: number;
  netout?: number;
  uptime?: number;
  tags?: string;
}

export interface SyncedVm {
  vmId: number;
  name: string;
  node: string;
  type: "qemu" | "lxc";
  status: string;
  cpus: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  tags: string | null;
}

export interface VncTicketResult {
  ticket: string;
  port: string;
  cert: string;
}

function request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const hdrs: Record<string, string> = { ...options.headers };
    if (options.body) {
      hdrs["Content-Length"] = Buffer.byteLength(options.body, "utf-8").toString();
    }

    const req = mod.request(
      url,
      {
        method: options.method ?? "GET",
        headers: hdrs,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            const json = JSON.parse(raw);
            resolve({ status: res.statusCode ?? 0, data: json });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function authenticate(
  host: string,
  port: number,
  username: string,
  password: string,
  realm: string
): Promise<ProxmoxAuth> {
  const url = `https://${host}:${port}/api2/json/access/ticket`;
  const body = `username=${encodeURIComponent(username)}@${encodeURIComponent(realm)}&password=${encodeURIComponent(password)}`;

  const { status, data } = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (status !== 200) {
    let msg = "Authentication failed";
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      if ("errors" in d) msg = JSON.stringify(d.errors);
      else if ("data" in d) msg = JSON.stringify(d.data);
      else msg = JSON.stringify(d);
    }
    console.error(`Proxmox auth response (${status}):`, JSON.stringify(data));
    throw new Error(`Proxmox auth failed (HTTP ${status}): ${msg}`);
  }

  const result = data as { data: { ticket: string; CSRFPreventionToken: string } };
  return {
    ticket: result.data.ticket,
    csrfToken: result.data.CSRFPreventionToken,
  };
}

async function apiGet<T>(
  host: string,
  port: number,
  path: string,
  auth: ProxmoxAuth
): Promise<T> {
  const url = `https://${host}:${port}${path}`;
  const { status, data } = await request(url, {
    headers: {
      Cookie: `PVEAuthCookie=${auth.ticket}`,
      CSRFPreventionToken: auth.csrfToken,
    },
  });

  if (status !== 200) {
    throw new Error(`Proxmox API error (${status}) for ${path}`);
  }

  return (data as { data: T }).data;
}

async function apiPost<T>(
  host: string,
  port: number,
  path: string,
  auth: ProxmoxAuth,
  body?: string
): Promise<T> {
  const url = `https://${host}:${port}${path}`;
  const headers: Record<string, string> = {
    Cookie: `PVEAuthCookie=${auth.ticket}`,
    CSRFPreventionToken: auth.csrfToken,
  };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const { status, data } = await request(url, {
    method: "POST",
    headers,
    body: body ?? "",
  });

  if (status !== 200) {
    const errMsg = typeof data === "object" && data !== null
      ? JSON.stringify(data)
      : String(data);
    throw new Error(`Proxmox API error (${status}) for ${path}: ${errMsg}`);
  }

  return (data as { data: T }).data;
}

export async function performVmAction(
  host: string,
  port: number,
  username: string,
  password: string,
  realm: string,
  node: string,
  vmId: number,
  type: string,
  action: string
): Promise<string> {
  const auth = await authenticate(host, port, username, password, realm);
  const vmType = type === "lxc" ? "lxc" : "qemu";

  const actionMap: Record<string, string> = {
    start: "start",
    stop: "stop",
    reboot: "reboot",
    shutdown: "shutdown",
    reset: "reset",
    suspend: "suspend",
    resume: "resume",
  };

  const proxmoxAction = actionMap[action];
  if (!proxmoxAction) {
    throw new Error(`Unknown VM action: ${action}`);
  }

  const path = `/api2/json/nodes/${node}/${vmType}/${vmId}/status/${proxmoxAction}`;
  const result = await apiPost<string>(host, port, path, auth);
  return result;
}

export async function getVncTicket(
  host: string,
  port: number,
  username: string,
  password: string,
  realm: string,
  node: string,
  vmId: number,
  type: string
): Promise<VncTicketResult & { auth: ProxmoxAuth }> {
  const auth = await authenticate(host, port, username, password, realm);
  const vmType = type === "lxc" ? "lxc" : "qemu";
  const path = `/api2/json/nodes/${node}/${vmType}/${vmId}/vncproxy`;
  const result = await apiPost<VncTicketResult>(
    host, port, path, auth, "websocket=1"
  );
  return { ...result, auth };
}

export interface NodeStatus {
  node: string;
  status: string;
  cpuUsage: number;
  cpuCount: number;
  cpuModel: string;
  loadAverage: string;
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  rootFsUsed: number;
  rootFsTotal: number;
  ioDelay: number;
  ksmSharing: number;
  kernelVersion: string;
  pveVersion: string;
  bootMode: string;
  uptime: number;
}

export async function getNodeStatuses(
  host: string,
  port: number,
  username: string,
  password: string,
  realm: string
): Promise<NodeStatus[]> {
  const auth = await authenticate(host, port, username, password, realm);
  const nodes = await apiGet<ProxmoxNode[]>(host, port, "/api2/json/nodes", auth);
  const results: NodeStatus[] = [];

  for (const node of nodes) {
    try {
      const status = await apiGet<any>(host, port, `/api2/json/nodes/${node.node}/status`, auth);
      const cpuinfo = status.cpuinfo ?? {};
      const memory = status.memory ?? {};
      const swap = status.swap ?? {};
      const rootfs = status.rootfs ?? {};
      const loadavg = status.loadavg ?? [0, 0, 0];
      const ksm = status.ksm ?? {};
      const bootInfo = status["boot-info"] ?? {};

      results.push({
        node: node.node,
        status: node.status ?? "unknown",
        cpuUsage: typeof status.cpu === "number" ? status.cpu : 0,
        cpuCount: cpuinfo.cpus ?? cpuinfo.cores ?? node.maxcpu ?? 0,
        cpuModel: cpuinfo.model ?? "",
        loadAverage: Array.isArray(loadavg) ? loadavg.join(", ") : String(loadavg),
        memUsed: memory.used ?? 0,
        memTotal: memory.total ?? 0,
        swapUsed: swap.used ?? 0,
        swapTotal: swap.total ?? 0,
        rootFsUsed: rootfs.used ?? 0,
        rootFsTotal: rootfs.total ?? 0,
        ioDelay: typeof status.wait === "number" ? status.wait : 0,
        ksmSharing: ksm.shared ?? 0,
        kernelVersion: status.kversion ?? "",
        pveVersion: status.pveversion ?? "",
        bootMode: bootInfo.mode ?? "",
        uptime: status.uptime ?? 0,
      });
    } catch (e) {
      console.error(`Failed to fetch status for node ${node.node}:`, e);
      results.push({
        node: node.node,
        status: "error",
        cpuUsage: 0, cpuCount: 0, cpuModel: "", loadAverage: "",
        memUsed: 0, memTotal: 0, swapUsed: 0, swapTotal: 0,
        rootFsUsed: 0, rootFsTotal: 0, ioDelay: 0, ksmSharing: 0,
        kernelVersion: "", pveVersion: "", bootMode: "", uptime: 0,
      });
    }
  }

  return results;
}

export async function syncFromProxmox(
  host: string,
  port: number,
  username: string,
  password: string,
  realm: string
): Promise<SyncedVm[]> {
  const auth = await authenticate(host, port, username, password, realm);

  const nodes = await apiGet<ProxmoxNode[]>(host, port, "/api2/json/nodes", auth);

  const allVms: SyncedVm[] = [];

  for (const node of nodes) {
    try {
      const qemuVms = await apiGet<ProxmoxVmEntry[]>(
        host, port, `/api2/json/nodes/${node.node}/qemu`, auth
      );
      for (const vm of qemuVms) {
        allVms.push({
          vmId: vm.vmid,
          name: vm.name ?? `vm-${vm.vmid}`,
          node: node.node,
          type: "qemu",
          status: vm.status,
          cpus: vm.maxcpu ?? null,
          memoryMb: vm.maxmem ? Math.round(vm.maxmem / 1024 / 1024) : null,
          diskGb: vm.maxdisk ? Math.round(vm.maxdisk / 1024 / 1024 / 1024) : null,
          tags: vm.tags ?? null,
        });
      }
    } catch (e) {
      console.error(`Failed to fetch QEMU VMs from node ${node.node}:`, e);
    }

    try {
      const lxcVms = await apiGet<ProxmoxVmEntry[]>(
        host, port, `/api2/json/nodes/${node.node}/lxc`, auth
      );
      for (const vm of lxcVms) {
        allVms.push({
          vmId: vm.vmid,
          name: vm.name ?? `ct-${vm.vmid}`,
          node: node.node,
          type: "lxc",
          status: vm.status,
          cpus: vm.maxcpu ?? null,
          memoryMb: vm.maxmem ? Math.round(vm.maxmem / 1024 / 1024) : null,
          diskGb: vm.maxdisk ? Math.round(vm.maxdisk / 1024 / 1024 / 1024) : null,
          tags: vm.tags ?? null,
        });
      }
    } catch (e) {
      console.error(`Failed to fetch LXC containers from node ${node.node}:`, e);
    }
  }

  return allVms;
}
