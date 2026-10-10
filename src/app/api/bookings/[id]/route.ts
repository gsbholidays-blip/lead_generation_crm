import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { can } from "@/lib/auth/rbac";
import { calculateBookingFinancials } from "@/lib/booking-financials";
import { generateInvoiceNumber } from "@/lib/invoice";
import { getBookingDetail } from "@/lib/queries/bookings";
import { buildBookingEventPayload, notifyBookingEvent } from "@/lib/notify-booking-event";
import {
  deleteSupabaseFile,
  InvalidFileUploadError,
  saveSupabaseDocument,
} from "@/lib/storage/supabase-file-storage";
import { updateBookingSchema } from "@/lib/validations/bookings";

export async function GET(_request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { id } = await ctx.params;
    const booking = await getBookingDetail(id);
    if (!booking) return jsonError("Booking not found", 404);
    return NextResponse.json({ booking });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const { id } = await ctx.params;

    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) return jsonError("Booking not found", 404);

    const formData = await request.formData();
    const input = updateBookingSchema.parse({
      guestName: formData.get("guestName") || undefined,
      phone: formData.get("phone") || undefined,
      email: formData.has("email") ? formData.get("email") || "" : undefined,
      checkInDate: formData.get("checkInDate") || undefined,
      checkOutDate: formData.get("checkOutDate") || undefined,
      nights: formData.get("nights") || undefined,
      stayType: formData.has("stayType") ? formData.get("stayType") || "" : undefined,
      adultCount: formData.get("adultCount") || undefined,
      kidsCount: formData.get("kidsCount") || undefined,
      infantCount: formData.get("infantCount") || undefined,
      adultCostPerPerson: formData.get("adultCostPerPerson") || undefined,
      kidsCostPerPerson: formData.get("kidsCostPerPerson") || undefined,
      b2bAdultAmount: formData.get("b2bAdultAmount") || undefined,
      b2bKidAmount: formData.get("b2bKidAmount") || undefined,
      advance: formData.get("advance") || undefined,
      includesFood: formData.has("includesFood") ? formData.get("includesFood") === "true" : undefined,
      notes: formData.has("notes") ? formData.get("notes") || "" : undefined,
      description: formData.has("description") ? formData.get("description") || "" : undefined,
      resortName: formData.has("resortName") ? formData.get("resortName") || "" : undefined,
      source: formData.has("source") ? formData.get("source") || "" : undefined,
      location: formData.has("location") ? formData.get("location") || "" : undefined,
      statusId: formData.get("statusId") || undefined,
      leadId: formData.has("leadId") ? formData.get("leadId") || "" : undefined,
      packageId: formData.has("packageId") ? formData.get("packageId") || "" : undefined,
      assignedToId: formData.has("assignedToId") ? formData.get("assignedToId") || "" : undefined,
      removeAttachment: formData.get("removeAttachment") || undefined,
    });

    // Snapshot the package name/destination at update time — only re-resolve
    // when packageId was actually part of this request.
    const linkedPackage = input.packageId
      ? await db.package.findUnique({ where: { id: input.packageId } })
      : null;

    // Recompute from the merged existing+incoming values so a partial update
    // (e.g. only b2bAdultAmount changing) still recalculates correctly.
    const { totalRevenue, vendorAmount, profit, balanceAmount } = calculateBookingFinancials({
      nights: input.nights ?? existing.nights,
      adultCount: input.adultCount ?? existing.adultCount,
      kidsCount: input.kidsCount ?? existing.kidsCount,
      adultCostPerPerson: input.adultCostPerPerson ?? existing.adultCostPerPerson,
      kidsCostPerPerson: input.kidsCostPerPerson ?? existing.kidsCostPerPerson,
      b2bAdultAmount: input.b2bAdultAmount ?? existing.b2bAdultAmount,
      b2bKidAmount: input.b2bKidAmount ?? existing.b2bKidAmount,
      advance: input.advance ?? existing.advance,
      stayType: input.stayType === "" ? null : input.stayType ?? existing.stayType,
    });

    let attachmentFields: Record<string, unknown> = {};
    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      try {
        const attachment = await saveSupabaseDocument(file, "bookings");
        await deleteSupabaseFile(existing.attachmentPath);
        attachmentFields = {
          attachmentPath: attachment.path,
          attachmentName: file.name,
          attachmentMimeType: attachment.mimeType,
          attachmentSize: file.size,
        };
      } catch (error) {
        if (error instanceof InvalidFileUploadError) {
          return jsonError(error.message, 400);
        }
        // Don't let a storage-layer hiccup fall through to an opaque 500 —
        // surface it as a clear, retriable error instead.
        console.error("Booking attachment upload failed", error);
        return jsonError("Failed to upload attachment. Please try again.", 502);
      }
    } else if (input.removeAttachment) {
      await deleteSupabaseFile(existing.attachmentPath);
      attachmentFields = {
        attachmentPath: null,
        attachmentName: null,
        attachmentMimeType: null,
        attachmentSize: null,
      };
    }

    const updated = await db.booking.update({
      where: { id },
      data: {
        guestName: input.guestName,
        phone: input.phone,
        email: input.email === "" ? null : input.email,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights: input.nights,
        stayType: input.stayType === "" ? null : input.stayType,
        adultCount: input.adultCount,
        kidsCount: input.kidsCount,
        infantCount: input.infantCount,
        adultCostPerPerson: input.adultCostPerPerson,
        kidsCostPerPerson: input.kidsCostPerPerson,
        vendorAmount,
        b2bAdultAmount: input.b2bAdultAmount,
        b2bKidAmount: input.b2bKidAmount,
        advance: input.advance,
        balanceAmount,
        includesFood: input.includesFood,
        notes: input.notes === "" ? null : input.notes,
        description: input.description === "" ? null : input.description,
        resortName: input.resortName === "" ? null : input.resortName,
        source: input.source === "" ? null : input.source,
        location: input.location === "" ? null : input.location,
        statusId: input.statusId,
        leadId: input.leadId === "" ? null : input.leadId,
        assignedToId: input.assignedToId === "" ? null : input.assignedToId,
        packageId: input.packageId,
        packageName: linkedPackage?.name,
        destination: linkedPackage?.destination,
        totalRevenue,
        profit,
        ...attachmentFields,
      },
    });

    // The booking form is the only place status is edited for a lead now —
    // whichever status was just picked there becomes the lead's status too.
    if (input.statusId !== undefined && updated.leadId) {
      await db.lead.update({
        where: { id: updated.leadId },
        data: { statusId: input.statusId, lastActivityAt: new Date() },
      });
    }

    // Bookings created before invoice numbers existed won't have one yet —
    // backfill lazily so every notification from here on has one.
    const withInvoice = updated.invoiceNumber
      ? updated
      : await db.booking.update({
          where: { id: updated.id },
          data: { invoiceNumber: await generateInvoiceNumber() },
        });
    after(() => notifyBookingEvent(buildBookingEventPayload(withInvoice, "BOOKING_UPDATED")));

    return NextResponse.json({ booking: withInvoice });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const session = await requireUser();
    if (!can(session.role, "deleteBooking")) {
      return jsonError("You are not allowed to delete bookings", 403);
    }
    const { id } = await ctx.params;

    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) return jsonError("Booking not found", 404);

    await db.booking.delete({ where: { id } });
    await deleteSupabaseFile(existing.attachmentPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
