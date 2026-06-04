import { describe, it, expect } from "vitest";
import { ROUTINE_TEMPLATES, buildRoutineDraftFromTemplate } from "./routineTemplates";

describe("ROUTINE_TEMPLATES", () => {
  it("has unique ids", () => {
    const ids = ROUTINE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every template has a 5-field cron and non-empty prompt", () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.cronExpression.trim().split(/\s+/)).toHaveLength(5);
      expect(t.promptBody.trim().length).toBeGreaterThan(0);
      expect(t.timezone.trim().length).toBeGreaterThan(0);
    }
  });
  it("buildRoutineDraftFromTemplate maps title + description", () => {
    const t = ROUTINE_TEMPLATES[0];
    expect(buildRoutineDraftFromTemplate(t)).toEqual({ title: t.defaultTitle, description: t.promptBody });
  });
});
