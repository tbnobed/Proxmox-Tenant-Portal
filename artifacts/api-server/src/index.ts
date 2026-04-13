import app, { sessionMiddleware } from "./app";
import { logger } from "./lib/logger";
import { setupVncProxy, handleUpgrade } from "./vnc-proxy";
import { setupLiveUpdates, handleLiveUpgrade } from "./live-updates";
import { seedDefaultAdmin } from "./seed-admin";
import { startHealthDigestScheduler } from "./health-digest";
import { startClusterAutoSync } from "./cluster-auto-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const vncWss = setupVncProxy();
const liveWss = setupLiveUpdates();

const server = app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedDefaultAdmin();
  } catch (e) {
    logger.error({ err: e }, "Failed to seed admin user");
  }

  startHealthDigestScheduler();
  startClusterAutoSync();
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/ws") {
    handleLiveUpgrade(liveWss, req, socket, head, sessionMiddleware);
  } else if (url.pathname === "/api/vnc") {
    handleUpgrade(vncWss, req, socket, head);
  } else {
    socket.destroy();
  }
});
