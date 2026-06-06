import { describe, it, expect } from "vitest";
import { createAccountDeletionService } from "../account-deletion.js";

// ---------------------------------------------------------------------------
// Minimal chainable mock for Drizzle's query builder.
// We record every `.delete(table)` call and the `.where(filter)` that follows.
// ---------------------------------------------------------------------------

interface DeleteRecord {
  table: string;
  // A rough string-ified representation of the filter for assertions
  filter: string;
}

function makeTableName(table: any): string {
  // Drizzle table objects expose their SQL name via Symbol(drizzle:Name)
  return table?.[Symbol.for("drizzle:Name")] ?? table?.[Symbol.for("drizzle:name")] ?? table?.tableName ?? String(table);
}

function makeDbStub(opts: {
  /** memberships for the user being deleted: [{ companyId, membershipRole }] */
  userMemberships: Array<{ companyId: string; membershipRole: string }>;
  /** For each companyId, how many OTHER human members exist */
  otherMemberCounts: Record<string, number>;
}) {
  const deleted: DeleteRecord[] = [];

  // Drizzle .select().from().where() chain — simplified
  // We need to return different things depending on which table is queried.
  // We model it by inspecting the call order.
  let selectCallCount = 0;

  const db: any = {
    transaction: async (fn: (tx: any) => Promise<any>) => fn(db),

    select: (_fields?: any) => {
      selectCallCount++;
      const callIdx = selectCallCount;
      return {
        from: (_table: any) => ({
          where: (_cond: any): any => {
            // First select per user = fetch memberships
            if (callIdx === 1) {
              return Promise.resolve(opts.userMemberships);
            }
            // Subsequent selects = count other members for a company
            // They are called in the order companies appear in userMemberships
            const companyIdx = callIdx - 2; // 0-based
            const companyId = opts.userMemberships[companyIdx]?.companyId;
            const cnt = companyId !== undefined ? (opts.otherMemberCounts[companyId] ?? 0) : 0;
            return Promise.resolve([{ value: cnt }]);
          },
        }),
      };
    },

    delete: (table: any) => {
      const tableName = makeTableName(table);
      return {
        where: (filter: any): Promise<void> => {
          deleted.push({ table: tableName, filter: String(filter) });
          return Promise.resolve();
        },
      };
    },
  };

  return { db, deleted };
}

// Attach the symbol-based name so makeTableName can identify them in output.
// We re-export the tables' [Symbol.for("drizzle:name")] values by spying on
// the actual imports. Since this is a unit test with a stub db, we only care
// about the ORDER of delete calls, not the exact drizzle table object identity.
// We verify ordering by index in the `deleted` array.

describe("createAccountDeletionService", () => {
  it("sole-owner case: deletes company, membership/role rows, and auth rows", async () => {
    const { db, deleted } = makeDbStub({
      userMemberships: [{ companyId: "c1", membershipRole: "owner" }],
      otherMemberCounts: { c1: 0 }, // sole owner
    });

    const svc = createAccountDeletionService(db);
    const result = await svc.deleteUserAccount("user-123");

    expect(result.deletedCompanies).toBe(1);

    // The companies delete must come before auth deletes
    const tableNames = deleted.map((d) => d.table);

    // companies deleted
    expect(tableNames).toContain("companies");

    // membership / role / pref rows deleted
    expect(tableNames).toContain("company_memberships");
    expect(tableNames).toContain("instance_user_roles");
    expect(tableNames).toContain("user_sidebar_preferences");
    expect(tableNames).toContain("company_user_sidebar_preferences");

    // auth rows deleted in order: session → account → user
    const sessionIdx = tableNames.indexOf("session");
    const accountIdx = tableNames.indexOf("account");
    const userIdx = tableNames.indexOf("user");

    expect(sessionIdx).toBeGreaterThanOrEqual(0);
    expect(accountIdx).toBeGreaterThan(sessionIdx);
    expect(userIdx).toBeGreaterThan(accountIdx);
  });

  it("shared workspace: does NOT delete the company but still deletes user rows and auth", async () => {
    const { db, deleted } = makeDbStub({
      userMemberships: [{ companyId: "c2", membershipRole: "member" }],
      otherMemberCounts: { c2: 2 }, // 2 other human members → shared
    });

    const svc = createAccountDeletionService(db);
    const result = await svc.deleteUserAccount("user-456");

    expect(result.deletedCompanies).toBe(0);

    const tableNames = deleted.map((d) => d.table);

    // companies row must NOT be deleted
    expect(tableNames).not.toContain("companies");

    // user's own membership still cleaned up
    expect(tableNames).toContain("company_memberships");

    // auth rows still deleted
    expect(tableNames).toContain("session");
    expect(tableNames).toContain("account");
    expect(tableNames).toContain("user");
  });

  it("guard: throws when userId is 'local-board'", async () => {
    const { db } = makeDbStub({ userMemberships: [], otherMemberCounts: {} });
    const svc = createAccountDeletionService(db);
    await expect(svc.deleteUserAccount("local-board")).rejects.toThrow(
      "Refusing to delete the local board user",
    );
  });

  it("guard: throws when userId is empty string", async () => {
    const { db } = makeDbStub({ userMemberships: [], otherMemberCounts: {} });
    const svc = createAccountDeletionService(db);
    await expect(svc.deleteUserAccount("")).rejects.toThrow(
      "Refusing to delete the local board user",
    );
  });
});
