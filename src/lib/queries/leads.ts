import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { LeadListQuery } from "@/lib/validations/leads";

export type LeadScope = { forcedAssignedToId?: string };

export function buildLeadWhere(query: LeadListQuery, scope: LeadScope): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  if (query.q) {
    where.OR = [
      { fullName: { contains: query.q, mode: "insensitive" } },
      { phone: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
  }

  if (query.statusId) where.statusId = query.statusId;
  if (query.source) where.source = query.source;

  if (query.createdFrom || query.createdTo) {
    where.createdAt = {};
    if (query.createdFrom) {
      const start = new Date(query.createdFrom);
      start.setHours(0, 0, 0, 0);
      where.createdAt.gte = start;
    }
    if (query.createdTo) {
      const end = new Date(query.createdTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (query.checkInFrom || query.checkInTo) {
    where.checkInDate = {};
    if (query.checkInFrom) {
      const start = new Date(query.checkInFrom);
      start.setHours(0, 0, 0, 0);
      where.checkInDate.gte = start;
    }
    if (query.checkInTo) {
      const end = new Date(query.checkInTo);
      end.setHours(23, 59, 59, 999);
      where.checkInDate.lte = end;
    }
  }

  if (scope.forcedAssignedToId) {
    where.assignedToId = scope.forcedAssignedToId;
  } else if (query.assignedToId) {
    where.assignedToId = query.assignedToId === "unassigned" ? null : query.assignedToId;
  }

  return where;
}

export async function listLeads(query: LeadListQuery, scope: LeadScope) {
  const where = buildLeadWhere(query, scope);

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        status: true,
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    db.lead.count({ where }),
  ]);

  return {
    leads,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getLeadDetail(id: string, scope: LeadScope) {
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      status: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      notes: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      followUps: { orderBy: { dueAt: "desc" } },
      whatsAppMessages: {
        orderBy: { createdAt: "asc" },
        include: { sentBy: { select: { id: true, name: true } } },
      },
      bookings: {
        orderBy: { checkInDate: "desc" },
        include: { status: { select: { id: true, name: true, color: true } } },
      },
    },
  });

  if (!lead) return null;
  if (scope.forcedAssignedToId && lead.assignedToId !== scope.forcedAssignedToId) {
    return null;
  }
  return lead;
}
