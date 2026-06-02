// Vercel serverless entry point for StockPilot API.
// Handles all /api/* requests. No embedded Postgres, no WebSockets.
// Set PAPERCLIP_DISABLE_LIVE_EVENTS_WS=true in Vercel env vars.

import { loadConfig } from "../server/src/config.js";
import { createDb, applyPendingMigrations } from "@paperclipai/db";
import { createApp } from "../server/src/app.js";
import { createStorageServiceFromConfig } from "../server/src/storage/index.js";
import { logger } from "../server/src/middleware/logger.js";

import type { IncomingMessage, ServerResponse } from "node:http";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, res: any, next: any) => void;

let handler: Handler | null = null;

async function getOrCreateHandler(): Promise<Handler> {
  if (handler) return handler;

  const config = loadConfig();

  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required in cloud mode. Set it in Vercel environment variables."
    );
  }

  const db = createDb(config.databaseUrl);

  try {
    await applyPendingMigrations(config.databaseUrl!);
    logger.info("Database migrations applied (or already up to date)");
  } catch (err) {
    // Only swallow connection-level transient errors (e.g. a brief Supabase
    // pooler hiccup). Any structural migration failure (missing column, failed
    // statement) re-throws so Vercel cold-start reports a clean 500 rather
    // than serving requests against a broken schema.
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const isTransient =
      msg.includes("connect") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound");
    if (isTransient) {
      logger.warn({ err }, "Migration check failed (transient) — continuing");
    } else {
      throw err; // structural failure — fail the cold start
    }
  }

  const storageService = createStorageServiceFromConfig(config);

  let betterAuthHandler: Handler | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolveSession: ((req: any) => Promise<unknown>) | undefined;

  if (config.deploymentMode === "authenticated") {
    const {
      createBetterAuthInstance,
      createBetterAuthHandler,
      resolveBetterAuthSessionFromHeaders,
      deriveAuthTrustedOrigins,
    } = await import("../server/src/auth/better-auth.js");
    const trustedOrigins = deriveAuthTrustedOrigins(config);
    const auth = createBetterAuthInstance(db as any, config, trustedOrigins);
    betterAuthHandler = createBetterAuthHandler(auth);
    resolveSession = (req) =>
      resolveBetterAuthSessionFromHeaders(auth, req.headers as any);
  }

  const app = await createApp(db as any, {
    uiMode: "none",
    serverPort: Number(process.env.PORT) || 3100,
    storageService,
    deploymentMode: config.deploymentMode,
    deploymentExposure: config.deploymentExposure,
    allowedHostnames: config.allowedHostnames,
    bindHost: config.host,
    authReady: true,
    companyDeletionEnabled: config.companyDeletionEnabled,
    betterAuthHandler,
    resolveSession: resolveSession as any,
  });

  handler = app;
  return handler;
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const h = await getOrCreateHandler();
    h(req as any, res as any, (err?: unknown) => {
      // next() reached the end of the middleware stack without sending a response,
      // or next(err) was called. Respond with 500 rather than hanging.
      if (!res.headersSent) {
        const status = err ? 500 : 404;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Not found" }));
      }
    });
  } catch (err) {
    logger.error({ err }, "Vercel handler failed to initialize");
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server initialization failed" }));
  }
}
