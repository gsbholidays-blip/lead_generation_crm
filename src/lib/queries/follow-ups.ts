import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { LeadScope } from "@/lib/queries/leads";
import type { FollowUpListQuery } from "@/lib/validations/follow-ups";

export async function getFollowUpsGrouped(scope: LeadScope) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const leadWhere = scope.forcedAssignedToId ? { assignedToId: scope.forcedAssignedToId } : {};

  const followUps = await db.followUp.findMany({
    where: { status: "PENDING", lead: leadWhere },
    include: {
      lead: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          status: { select: { name: true, color: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });

  const missed = followUps.filter((f) => f.dueAt < startOfToday);
  const today = followUps.filter((f) => f.dueAt >= startOfToday && f.dueAt < startOfTomorrow);
  const upcoming = followUps.filter((f) => f.dueAt >= startOfTomorrow);

  return { missed, today, upcoming };
}

// Powers the dedicated Follow-ups page: a flat, searchable, paginated table
// filterable by the lead's enquiry date (createdAt) — a single date is just
// enquiredFrom === enquiredTo, a range is both set independently.
export async function listFollowUps(query: FollowUpListQuery, scope: LeadScope) {
  const leadWhere: Prisma.LeadWhereInput = {};
  if (scope.forcedAssignedToId) leadWhere.assignedToId = scope.forcedAssignedToId;
  if (query.leadStatusId) leadWhere.statusId = query.leadStatusId;
  if (query.q) {
    leadWhere.OR = [
      { fullName: { contains: query.q, mode: "insensitive" } },
      { phone: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.enquiredFrom || query.enquiredTo) {
    leadWhere.createdAt = {};
    if (query.enquiredFrom) {
      const start = new Date(query.enquiredFrom);
      start.setHours(0, 0, 0, 0);
      leadWhere.createdAt.gte = start;
    }
    if (query.enquiredTo) {
      const end = new Date(query.enquiredTo);
      end.setHours(23, 59, 59, 999);
      leadWhere.createdAt.lte = end;
    }
  }

  // No filter chosen keeps today's default view (Pending only); "ALL" is an
  // explicit request to see every status, distinct from that default.
  const statusFilter =
    query.status === "ALL" ? undefined : query.status ?? "PENDING";

  // "MISSED" is never actually persisted on a FollowUp's status column — there's
  // no cron transitioning overdue PENDING follow-ups to MISSED. Treat it as a
  // derived state at query time: a real MISSED row (if one ever exists) OR any
  // still-PENDING follow-up whose dueAt has already passed.
  const where: Prisma.FollowUpWhereInput = {
    lead: leadWhere,
    ...(statusFilter === "MISSED"
      ? { OR: [{ status: "MISSED" }, { status: "PENDING", dueAt: { lt: new Date() } }] }
      : statusFilter
        ? { status: statusFilter }
        : {}),
  };

  const orderBy: Prisma.FollowUpOrderByWithRelationInput =
    query.sortBy === "fullName"
      ? { lead: { fullName: query.sortDir } }
      : query.sortBy === "createdAt"
        ? { lead: { createdAt: query.sortDir } }
        : { dueAt: query.sortDir };

  const [followUps, total] = await Promise.all([
    db.followUp.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            createdAt: true,
            status: { select: { name: true, color: true } },
            assignedTo: { select: { id: true, name: true } },
          },
        },
      },
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.followUp.count({ where }),
  ]);

  return {
    followUps,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
