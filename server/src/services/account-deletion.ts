import { and, eq, ne, inArray, count } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  authSessions,
  authAccounts,
  companies,
  companyMemberships,
  instanceUserRoles,
  userSidebarPreferences,
  companyUserSidebarPreferences,
} from "@paperclipai/db";

export function createAccountDeletionService(db: Db) {
  return {
    async deleteUserAccount(userId: string): Promise<{ deletedCompanies: number }> {
      // Guard: never delete the local implicit board user
      if (!userId || userId === "local-board") {
        throw new Error("Refusing to delete the local board user");
      }

      return db.transaction(async (tx) => {
        // Step 2: Find all active 'user' memberships for this user
        const memberships = await tx
          .select({ companyId: companyMemberships.companyId, membershipRole: companyMemberships.membershipRole })
          .from(companyMemberships)
          .where(
            and(
              eq(companyMemberships.principalType, "user"),
              eq(companyMemberships.principalId, userId),
              eq(companyMemberships.status, "active"),
            ),
          );

        // Step 3: Determine solely-owned companies (user is the only human member)
        const solelyOwnedIds: string[] = [];
        for (const { companyId } of memberships) {
          const [{ value: otherCount }] = await tx
            .select({ value: count() })
            .from(companyMemberships)
            .where(
              and(
                eq(companyMemberships.companyId, companyId),
                eq(companyMemberships.principalType, "user"),
                ne(companyMemberships.principalId, userId),
                eq(companyMemberships.status, "active"),
              ),
            );
          if (Number(otherCount) === 0) {
            solelyOwnedIds.push(companyId);
          }
        }

        // Step 4: Delete solely-owned companies (cascades to all child tables)
        if (solelyOwnedIds.length > 0) {
          await tx.delete(companies).where(inArray(companies.id, solelyOwnedIds));
        }

        // Step 5: Delete user's own rows
        await tx
          .delete(companyMemberships)
          .where(
            and(
              eq(companyMemberships.principalType, "user"),
              eq(companyMemberships.principalId, userId),
            ),
          );

        await tx.delete(instanceUserRoles).where(eq(instanceUserRoles.userId, userId));

        // User-preference tables (both are confirmed exported)
        await tx.delete(userSidebarPreferences).where(eq(userSidebarPreferences.userId, userId));
        await tx.delete(companyUserSidebarPreferences).where(eq(companyUserSidebarPreferences.userId, userId));

        // Step 6: Delete auth rows in order (sessions → accounts → user)
        await tx.delete(authSessions).where(eq(authSessions.userId, userId));
        await tx.delete(authAccounts).where(eq(authAccounts.userId, userId));
        await tx.delete(authUsers).where(eq(authUsers.id, userId));

        return { deletedCompanies: solelyOwnedIds.length };
      });
    },
  };
}
