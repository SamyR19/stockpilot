import { describe, it, expect } from "vitest";
import { ANALYST_PERSONAS } from "./analystPersonas";
describe("ANALYST_PERSONAS", () => {
  it("has 6 unique personas with catalog keys", () => {
    expect(ANALYST_PERSONAS).toHaveLength(6);
    const ids = ANALYST_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
    for (const p of ANALYST_PERSONAS) {
      expect(p.skillKey).toBe(`paperclipai/optional/finance/${p.id}`);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
      expect(p.role.length).toBeGreaterThan(0);
    }
  });
});
