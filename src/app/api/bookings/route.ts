import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { calculateBookingFinancials } from "@/lib/booking-financials";
import { generateInvoiceNumber } from "@/lib/invoice";
import { listBookings } from "@/lib/queries/bookings";
import { buildBookingEventPayload, notifyBookingEvent } from "@/lib/notify-booking-event";
import { InvalidFileUploadError, saveSupabaseDocument } from "@/lib/storage/supabase-file-storage";
import { bookingListQuerySchema, createBookingSchema } from "@/lib/validations/bookings";

export async function GET(request: NextRequest) {
  try {
    await requireRole("ADMIN", "MANAGER");
    const query = bookingListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    const result = await listBookings(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "MANAGER");
    const formData = await request.formData();

    const input = createBookingSchema.parse({
      guestName: formData.get("guestName"),
      phone: formData.get("phone"),
      email: formData.get("email") || undefined,
      checkInDate: formData.get("checkInDate"),
      checkOutDate: formData.get("checkOutDate"),
      nights: formData.get("nights") || undefined,
      stayType: formData.get("stayType") || undefined,
      adultCount: formData.get("adultCount"),
      kidsCount: formData.get("kidsCount") || undefined,
      infantCount: formData.get("infantCount") || undefined,
      adultCostPerPerson: formData.get("adultCostPerPerson"),
      kidsCostPerPerson: formData.get("kidsCostPerPerson") || undefined,
      b2bAdultAmount: formData.get("b2bAdultAmount") || undefined,
      b2bKidAmount: formData.get("b2bKidAmount") || undefined,
      advance: formData.get("advance") || undefined,
      includesFood: formData.get("includesFood") === "true",
      notes: formData.get("notes") || undefined,
      description: formData.get("description") || undefined,
      resortName: formData.get("resortName") || undefined,
      source: formData.get("source") || undefined,
      location: formData.get("location") || undefined,
      statusId: formData.get("statusId") || undefined,
      leadId: formData.get("leadId") || undefined,
      packageId: formData.get("packageId") || undefined,
      assignedToId: formData.get("assignedToId") || undefined,
    });

    const { totalRevenue, vendorAmount, profit, balanceAmount } = calculateBookingFinancials(input);

    // Snapshot the package name/destination at booking time — denormalized
    // so earnings reporting survives the package being renamed/deleted later.
    const linkedPackage = input.packageId
      ? await db.package.findUnique({ where: { id: input.packageId } })
      : null;

    let attachment: { path: string; mimeType: string } | null = null;
    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      try {
        attachment = await saveSupabaseDocument(file, "bookings");
      } catch (error) {
        if (error instanceof InvalidFileUploadError) {
          return jsonError(error.message, 400);
        }
        // Don't let a storage-layer hiccup (network blip, bucket
        // misconfiguration, etc.) fall through to an opaque 500 — surface it
        // as a clear, retriable error instead.
        console.error("Booking attachment upload failed", error);
        return jsonError("Failed to upload attachment. Please try again.", 502);
      }
    }

    const booking = await db.booking.create({
      data: {
        guestName: input.guestName,
        phone: input.phone,
        email: input.email,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights: input.nights,
        stayType: input.stayType,
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
        totalRevenue,
        profit,
        includesFood: input.includesFood,
        notes: input.notes,
        description: input.description,
        resortName: input.resortName,
        source: input.source,
        location: input.location,
        statusId: input.statusId,
        leadId: input.leadId,
        assignedToId: input.assignedToId,
        packageId: linkedPackage?.id,
        packageName: linkedPackage?.name,
        destination: linkedPackage?.destination,
        createdById: session.sub,
        attachmentPath: attachment?.path,
        attachmentName: file instanceof File ? file.name : undefined,
        attachmentMimeType: attachment?.mimeType,
        attachmentSize: file instanceof File ? file.size : undefined,
      },
    });

    // The booking form is the only place status is edited for a lead now —
    // whichever status was just picked there becomes the lead's status too.
    if (input.leadId) {
      await db.lead.update({
        where: { id: input.leadId },
        data: { statusId: input.statusId, lastActivityAt: new Date() },
      });
    }

    const invoiceNumber = await generateInvoiceNumber();
    const withInvoice = await db.booking.update({
      where: { id: booking.id },
      data: { invoiceNumber },
    });
    // Vercel does not guarantee an un-awaited promise keeps running once the
    // response is sent — after() schedules it to actually complete instead.
    after(() => notifyBookingEvent(buildBookingEventPayload(withInvoice, "BOOKING_CREATED")));

    return NextResponse.json({ booking: withInvoice }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
