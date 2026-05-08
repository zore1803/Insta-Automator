import { Router } from "express";
import { db, postsTable, configTable, eq, gte, and, count, asc, ne } from "../../lib/db/src/index.ts";

const router = Router();

router.get("/stats", async (req, res) => {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    postedResult,
    pendingResult,
    approvedResult,
    rejectedResult,
    thisWeekResult,
    thisMonthResult,
    configResult,
    nextPostResult,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.status, "posted")),
    db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.status, "pending")),
    db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.status, "approved")),
    db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.status, "rejected")),
    db
      .select({ count: count() })
      .from(postsTable)
      .where(
        and(eq(postsTable.status, "posted"), gte(postsTable.postedAt, startOfWeek))
      ),
    db
      .select({ count: count() })
      .from(postsTable)
      .where(
        and(eq(postsTable.status, "posted"), gte(postsTable.postedAt, startOfMonth))
      ),
    db.select().from(configTable).limit(1),
    db
      .select({ scheduledFor: postsTable.scheduledFor })
      .from(postsTable)
      .where(
        and(
          eq(postsTable.status, "approved"),
          gte(postsTable.scheduledFor, now)
        )
      )
      .orderBy(asc(postsTable.scheduledFor))
      .limit(1),
  ]);

  res.json({
    totalPosted: postedResult[0]?.count ?? 0,
    totalPending: pendingResult[0]?.count ?? 0,
    totalApproved: approvedResult[0]?.count ?? 0,
    totalRejected: rejectedResult[0]?.count ?? 0,
    postsThisWeek: thisWeekResult[0]?.count ?? 0,
    postsThisMonth: thisMonthResult[0]?.count ?? 0,
    autoApproveEnabled: configResult[0]?.autoApprove ?? false,
    nextScheduledPost: nextPostResult[0]?.scheduledFor?.toISOString() ?? null,
  });
});

export default router;
