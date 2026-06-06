import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { createPortfolioRouter } from "../portfolio.js";

function stubDb() {
  return {
    insert: () => ({
      values: () => ({
        returning: () =>
          Promise.resolve([
            { id: "h1", ticker: "AAPL", shares: "10", avgCost: "150", notes: null },
          ]),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () =>
            Promise.resolve([
              { id: "h1", ticker: "AAPL", shares: "10", avgCost: "150", notes: null },
            ]),
        }),
      }),
    }),
  } as any;
}

function appWith(db: any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", source: "local_implicit" };
    next();
  });
  app.use("/api/portfolio", createPortfolioRouter(db));
  return app;
}

describe("POST /api/portfolio/:companyId/holdings", () => {
  it("inserts a holding and returns ticker uppercased", async () => {
    const res = await request(appWith(stubDb()))
      .post("/api/portfolio/c1/holdings")
      .send({ ticker: "aapl", shares: "10", avgCost: "150" });
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe("AAPL");
  });
});

describe("GET /api/portfolio/:companyId/holdings", () => {
  it("returns an array of holdings", async () => {
    const res = await request(appWith(stubDb())).get("/api/portfolio/c1/holdings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
