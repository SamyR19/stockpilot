import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { createAlertsRouter } from "../alerts.js";

function stubDb() {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: "e1",
                    ticker: "AAPL",
                    conditionType: "price_above",
                    value: "101",
                    triggeredAt: new Date(),
                    notified: false,
                  },
                ]),
            }),
          }),
        }),
      }),
    }),
  } as any;
}

function appWith(db: any) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", source: "local_implicit" };
    next();
  });
  app.use("/api/alerts", createAlertsRouter(db));
  return app;
}

describe("GET /api/alerts/:companyId/events", () => {
  it("returns recent events for the company", async () => {
    const res = await request(appWith(stubDb())).get("/api/alerts/c1/events");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].ticker).toBe("AAPL");
  });
});
