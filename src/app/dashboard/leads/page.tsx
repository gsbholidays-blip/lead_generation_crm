import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listLeads, type LeadScope } from "@/lib/queries/leads";
import { leadListQuerySchema } from "@/lib/validations/leads";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentUser();
  const sp = await searchParams;
  const query = leadListQuerySchema.parse(sp);
  const scope: LeadScope =
    session?.role === "SALES_EXECUTIVE" ? { forcedAssignedToId: session.sub } : {};

  const [result, statuses, users] = await Promise.all([
    listLeads(query, scope),
    db.leadStatus.findMany({ orderBy: { order: "asc" } }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const role = session?.role ?? "SALES_EXECUTIVE";

  const leads = result.leads.map((lead) => ({
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    state: lead.state,
    packageInterest: lead.packageInterest,
    source: lead.source,
    invoiceNumber: lead.invoiceNumber,
    createdAt: lead.createdAt.toISOString(),
    followUpDate: lead.followUpDate ? lead.followUpDate.toISOString() : null,
    checkInDate: lead.checkInDate ? lead.checkInDate.toISOString() : null,
    checkOutDate: lead.checkOutDate ? lead.checkOutDate.toISOString() : null,
    statusId: lead.statusId,
    status: { id: lead.status.id, name: lead.status.name, color: lead.status.color },
    assignedTo: lead.assignedTo,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-muted-foreground text-sm">
          {result.total} lead{result.total === 1 ? "" : "s"} in total
        </p>
      </div>

      <LeadsToolbar
        statuses={statuses}
        users={users}
        showAssigneeFilter={role !== "SALES_EXECUTIVE"}
        canReassign={can(role, "reassignLeads")}
      />

      <LeadsTable
        leads={leads}
        users={users}
        canReassign={can(role, "reassignLeads")}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        canDelete={can(role, "deleteLead")}
      />
    </div>
  );
}
