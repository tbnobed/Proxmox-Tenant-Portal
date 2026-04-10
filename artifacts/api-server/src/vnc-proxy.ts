import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { logger } from "./lib/logger";

interface VncSession {
  host: string;
  port: number;
  node: string;
  vmId: number;
  type: string;
  ticket: string;
  vncTicket: string;
  vncPort: string;
  csrfToken: string;
  createdAt: number;
}

const sessions = new Map<string, VncSession>();

export function createVncSession(token: string, session: VncSession) {
  sessions.set(token, session);
  setTimeout(() => sessions.delete(token), 120_000);
}

export function setupVncProxy(): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      if (protocols.has("binary")) return "binary";
      return false;
    },
  });

  wss.on("connection", (clientWs: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      logger.warn("VNC proxy: no token provided");
      clientWs.close(4001, "No token");
      return;
    }

    const session = sessions.get(token);
    if (!session) {
      logger.warn("VNC proxy: invalid or expired token");
      clientWs.close(4002, "Invalid token");
      return;
    }

    sessions.delete(token);

    clientWs.binaryType = "arraybuffer";

    const pendingClientMessages: Buffer[] = [];
    let proxmoxReady = false;

    const vmType = session.type === "lxc" ? "lxc" : "qemu";
    const wsPath = `/api2/json/nodes/${session.node}/${vmType}/${session.vmId}/vncwebsocket?port=${session.vncPort}&vncticket=${encodeURIComponent(session.vncTicket)}`;
    const wsUrl = `wss://${session.host}:${session.port}${wsPath}`;

    logger.info({ wsUrl: wsUrl.split("?")[0] }, "VNC proxy: connecting to Proxmox");

    const proxmoxWs = new WebSocket(wsUrl, ["binary"], {
      headers: {
        Cookie: `PVEAuthCookie=${session.ticket}`,
      },
      rejectUnauthorized: false,
    });

    proxmoxWs.binaryType = "arraybuffer";

    proxmoxWs.on("open", () => {
      logger.info("VNC proxy: connected to Proxmox VNC WebSocket");
      proxmoxReady = true;

      for (const msg of pendingClientMessages) {
        if (proxmoxWs.readyState === WebSocket.OPEN) {
          proxmoxWs.send(msg);
        }
      }
      pendingClientMessages.length = 0;
    });

    proxmoxWs.on("message", (data: RawData, isBinary: boolean) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(toBuffer(data), { binary: true });
      }
    });

    proxmoxWs.on("close", (code, reason) => {
      logger.info({ code, reason: reason.toString() }, "VNC proxy: Proxmox WS closed");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1000, "Proxmox session ended");
      }
    });

    proxmoxWs.on("error", (err) => {
      logger.error({ err: err.message }, "VNC proxy: Proxmox WS error");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(4003, "Proxmox connection error");
      }
    });

    clientWs.on("message", (data: RawData, isBinary: boolean) => {
      const buf = toBuffer(data);
      if (proxmoxReady && proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.send(buf);
      } else {
        pendingClientMessages.push(buf);
      }
    });

    clientWs.on("close", (code) => {
      logger.info({ code }, "VNC proxy: client disconnected");
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.close();
      }
    });

    clientWs.on("error", (err) => {
      logger.error({ err: err.message }, "VNC proxy: client WS error");
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.close();
      }
    });
  });

  return wss;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as any);
}

export function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/vnc") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.binaryType = "arraybuffer";
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
}
