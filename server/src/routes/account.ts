import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertAuthenticated } from "./authz.js";
import { createAccountDeletionService } from "../services/account-deletion.js";

export function createAccountRouter(db: Db): Router {
  const router = Router();

  router.use((req, _res, next) => {
    try {
      assertAuthenticated(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.delete("/", async (req, res, next) => {
    try {
      if (req.actor.type !== "board" || !(req.actor as any).userId) {
        return res.status(400).json({ error: "No deletable account" });
      }
      const userId = (req.actor as any).userId as string;
      const result = await createAccountDeletionService(db).deleteUserAccount(userId);
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
