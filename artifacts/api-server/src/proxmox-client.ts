import https from "node:https";
import http from "node:http";

interface ProxmoxAuth {
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

    const req = mod.request(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers,
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

async function authenticate(
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
    const msg = typeof data === "object" && data !== null && "errors" in data
      ? JSON.stringify((data as Record<string, unknown>).errors)
      : "Authentication failed";
    throw new Error(`Proxmox auth failed (${status}): ${msg}`);
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
