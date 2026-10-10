import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { getLeadDetail, type LeadScope } from "@/lib/queries/leads";
import { LeadHeader } from "@/components/leads/lead-header";
import { LeadTimeline } from "@/components/leads/lead-timeline";
import { LeadBookingHistory } from "@/components/leads/lead-booking-history";
import { LeadWhatsAppChat } from "@/components/leads/lead-whatsapp-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentUser();
  const scope: LeadScope =
    session?.role === "SALES_EXECUTIVE" ? { forcedAssignedToId: session.sub } : {};

  const [lead, statuses, users, activeWhatsAppAccountCount, packages] = await Promise.all([
    getLeadDetail(id, scope),
    db.leadStatus.findMany({ orderBy: { order: "asc" } }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.whatsAppAccount.count({ where: { isActive: true } }),
    db.package.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        destination: true,
        type: true,
        price: true,
        priceUnit: true,
        maxGuests: true,
        description: true,
        imagePath: true,
      },
      orderBy: { order: "asc" },
    }),
  ]);

  if (!lead || !session) notFound();

  // Booking creation/editing has always been an ADMIN/MANAGER-only capability
  // (see the old /dashboard/bookings API role checks) — preserved here now
  // that it lives inline on the lead page instead of a separate page.
  const canManageBookings = session.role !== "SALES_EXECUTIVE";
  const canDeleteBookings = can(session.role, "deleteBooking");
  const canCancelBookings = can(session.role, "cancelBooking");

  const timeline = (
    <LeadTimeline
      activities={lead.activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
        user: a.user,
      }))}
    />
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <LeadHeader lead={lead} users={users} canReassign={can(session.role, "reassignLeads")} />

      <LeadBookingHistory
        leadId={lead.id}
        leadDefaults={{
          fullName: lead.fullName,
          phone: lead.phone,
          email: lead.email,
          checkInDate: lead.checkInDate?.toISOString() ?? null,
          checkOutDate: lead.checkOutDate?.toISOString() ?? null,
          guestsAdults: lead.guestsAdults,
          guestsKids: lead.guestsKids,
          guestsInfants: lead.guestsInfants,
          packageId: lead.packageId,
        }}
        packages={packages.map((p) => ({ ...p, price: p.price.toString() }))}
        users={users}
        statuses={statuses}
        canManage={canManageBookings}
        canDelete={canDeleteBookings}
        canCancel={canCancelBookings}
        bookings={lead.bookings.map((b) => ({
          id: b.id,
          guestName: b.guestName,
          phone: b.phone,
          email: b.email,
          checkInDate: b.checkInDate.toISOString(),
          checkOutDate: b.checkOutDate.toISOString(),
          nights: b.nights,
          stayType: b.stayType,
          adultCount: b.adultCount,
          kidsCount: b.kidsCount,
          infantCount: b.infantCount,
          adultCostPerPerson: b.adultCostPerPerson.toString(),
          kidsCostPerPerson: b.kidsCostPerPerson.toString(),
          vendorAmount: b.vendorAmount.toString(),
          advance: b.advance.toString(),
          balanceAmount: b.balanceAmount.toString(),
          totalRevenue: b.totalRevenue.toString(),
          profit: b.profit.toString(),
          b2bAdultAmount: b.b2bAdultAmount.toString(),
          b2bKidAmount: b.b2bKidAmount.toString(),
          includesFood: b.includesFood,
          notes: b.notes,
          description: b.description,
          resortName: b.resortName,
          source: b.source,
          location: b.location,
          statusId: b.statusId,
          status: b.status,
          leadId: b.leadId,
          assignedToId: b.assignedToId,
          packageId: b.packageId,
          packageName: b.packageName,
          destination: b.destination,
          attachmentPath: b.attachmentPath,
          attachmentName: b.attachmentName,
          isCancelled: b.isCancelled,
          cancelledAt: b.cancelledAt?.toISOString() ?? null,
        }))}
      />

      {activeWhatsAppAccountCount > 0 ? (
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">{timeline}</TabsContent>
          <TabsContent value="whatsapp">
            <LeadWhatsAppChat
              leadId={lead.id}
              initialMessages={lead.whatsAppMessages.map((m) => ({
                id: m.id,
                direction: m.direction,
                content: m.content,
                status: m.status,
                errorMessage: m.errorMessage,
                createdAt: m.createdAt.toISOString(),
                sentBy: m.sentBy,
              }))}
            />
          </TabsContent>
        </Tabs>
      ) : (
        timeline
      )}
    </div>
  );
}
