import app from "./app";
import { logger } from "./lib/logger";
import { setupVncProxy, handleUpgrade } from "./vnc-proxy";
import { seedDefaultAdmin } from "./seed-admin";

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

const wss = setupVncProxy();

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
});

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(wss, req, socket, head);
});
