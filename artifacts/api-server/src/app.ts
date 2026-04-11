import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import router from "./routes";
import authRouter from "./routes/auth";
import passwordResetRouter from "./routes/password-reset";
import invitesRouter from "./routes/invites";
import notificationsRouter from "./routes/notifications";
import tenantQuotasRouter from "./routes/tenant-quotas";
import { requireAuth } from "./middleware/auth";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    secret: process.env["SESSION_SECRET"] || "proxmox-portal-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env["COOKIE_SECURE"] === "true",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

app.use("/api", authRouter);
app.use("/api", passwordResetRouter);
app.use("/api", invitesRouter);
app.use("/api", requireAuth, tenantQuotasRouter);
app.use("/api", requireAuth, router);
app.use("/api", requireAuth, notificationsRouter);

if (isProduction) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, "..", "..", "proxmox-portal", "dist", "public");

  if (existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(frontendDir, "index.html"));
    });
    logger.info({ frontendDir }, "Serving frontend static files");
  } else {
    logger.warn({ frontendDir }, "Frontend build directory not found — static files will not be served");
  }
}

export default app;
