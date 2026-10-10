"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";

import { bookingFormSchema, type BookingFormValues } from "@/lib/validations/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LeadOption = { id: string; fullName: string };
type PackageOption = {
  id: string;
  name: string;
  destination: string | null;
  type: string;
  price: string;
  priceUnit: string;
  maxGuests: number;
  description: string;
  imagePath: string;
};
type UserOption = { id: string; name: string };
type StatusOption = { id: string; name: string; color: string; requiresFollowUp: boolean };

export type BookingRow = {
  id: string;
  guestName: string;
  phone: string;
  email: string | null;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  stayType: "VILLA" | "TENT_CAMPING" | "COTTAGE" | "FARM_HOUSE" | "GLAMPING" | "RESORT" | null;
  adultCount: number;
  kidsCount: number;
  infantCount: number;
  adultCostPerPerson: string;
  kidsCostPerPerson: string;
  vendorAmount: string;
  b2bAdultAmount: string;
  b2bKidAmount: string;
  advance: string;
  balanceAmount: string;
  totalRevenue: string;
  profit: string;
  includesFood: boolean;
  notes: string | null;
  description: string | null;
  resortName: string | null;
  source: "FACEBOOK" | "INSTAGRAM" | "WHATSAPP" | "MANUAL" | "WEBSITE" | "OTHER" | null;
  location: "LONAVALA" | "KARJAT" | "ALIBAGH" | "PANVEL" | null;
  statusId: string;
  status: { id: string; name: string; color: string };
  leadId: string | null;
  assignedToId: string | null;
  packageId: string | null;
  packageName: string | null;
  destination: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  isCancelled: boolean;
  cancelledAt: string | null;
};

const STAY_TYPE_LABELS: Record<string, string> = {
  VILLA: "Villa",
  TENT_CAMPING: "Tent Camping",
  COTTAGE: "Cottages",
  FARM_HOUSE: "Farm House",
  GLAMPING: "Glamping",
  RESORT: "Resort",
};

const LOCATION_LABELS: Record<string, string> = {
  LONAVALA: "Lonavala",
  KARJAT: "Karjat",
  ALIBAGH: "Alibagh",
  PANVEL: "Panvel",
};

const SOURCE_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  MANUAL: "Manual",
  WEBSITE: "Website",
  OTHER: "Other",
};

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function numberOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

// Plain-number approximation for the live preview only — the authoritative
// figure is always recomputed server-side with Prisma.Decimal on submit.
// Deliberately does NOT import from @/lib/booking-financials: that helper
// pulls in the generated Prisma client (for Prisma.Decimal), which drags
// Node-only internals into the browser bundle and breaks the client build.
function previewFinancials(input: {
  nights: number;
  adultCount: number;
  kidsCount: number;
  adultCostPerPerson: number;
  kidsCostPerPerson: number;
  b2bAdultAmount: number;
  b2bKidAmount: number;
  advance: number;
  isVilla: boolean;
}) {
  // Villas are priced per-stay (manually entered total), not per-person/
  // per-night — see calculateBookingFinancials in booking-financials.ts,
  // which this preview mirrors.
  if (input.isVilla) {
    const totalRevenue = input.adultCostPerPerson;
    const vendorAmount = input.b2bAdultAmount;
    const profit = totalRevenue - vendorAmount;
    const balanceAmount = totalRevenue - input.advance;
    return { totalRevenue, vendorAmount, profit, balanceAmount };
  }

  const totalRevenue =
    (input.adultCount * input.adultCostPerPerson + input.kidsCount * input.kidsCostPerPerson) *
    input.nights;
  // Total Vendor Amount is derived from the B2B rates the same way Total
  // Amount is derived from the customer-facing rates — not entered directly.
  const vendorAmount =
    (input.adultCount * input.b2bAdultAmount + input.kidsCount * input.b2bKidAmount) *
    input.nights;
  const profit = totalRevenue - vendorAmount;
  const balanceAmount = totalRevenue - input.advance;
  return { totalRevenue, vendorAmount, profit, balanceAmount };
}

export function BookingForm({
  mode,
  booking,
  leads,
  packages,
  users,
  statuses,
  onDone,
  onCancel,
  lockedLeadId,
  leadDefaults,
}: {
  mode: "create" | "edit";
  booking?: BookingRow;
  leads: LeadOption[];
  packages: PackageOption[];
  users: UserOption[];
  statuses: StatusOption[];
  /** Called after a successful save. */
  onDone?: () => void;
  /** Only rendered in edit mode — lets the caller drop back to the create form. */
  onCancel?: () => void;
  /** When set, the booking is created/edited in the context of a single lead — the
   * "Linked Lead" field is hidden and every submission stays pinned to this lead. */
  lockedLeadId?: string;
  leadDefaults?: {
    fullName: string;
    phone: string;
    email?: string | null;
    checkInDate?: string | null;
    checkOutDate?: string | null;
    guestsAdults?: number | null;
    guestsKids?: number | null;
    guestsInfants?: number | null;
    packageId?: string | null;
  };
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: booking
      ? {
          guestName: booking.guestName,
          phone: booking.phone,
          email: booking.email ?? "",
          checkInDate: new Date(booking.checkInDate),
          checkOutDate: new Date(booking.checkOutDate),
          nights: booking.nights,
          stayType: booking.stayType ?? "",
          adultCount: booking.adultCount,
          kidsCount: booking.kidsCount,
          infantCount: booking.infantCount,
          adultCostPerPerson: Number(booking.adultCostPerPerson),
          kidsCostPerPerson: Number(booking.kidsCostPerPerson),
          b2bAdultAmount: Number(booking.b2bAdultAmount),
          b2bKidAmount: Number(booking.b2bKidAmount),
          advance: Number(booking.advance),
          includesFood: booking.includesFood,
          notes: booking.notes ?? "",
          description: booking.description ?? "",
          resortName: booking.resortName ?? "",
          source: booking.source ?? "",
          location: booking.location ?? "",
          statusId: booking.statusId,
          leadId: lockedLeadId ?? booking.leadId ?? "",
          assignedToId: booking.assignedToId ?? "",
          packageId: booking.packageId ?? "",
        }
      : {
          guestName: leadDefaults?.fullName ?? "",
          phone: leadDefaults?.phone ?? "",
          email: leadDefaults?.email ?? "",
          checkInDate: leadDefaults?.checkInDate ? new Date(leadDefaults.checkInDate) : undefined,
          checkOutDate: leadDefaults?.checkOutDate
            ? new Date(leadDefaults.checkOutDate)
            : undefined,
          nights: 1,
          stayType: "",
          adultCount: leadDefaults?.guestsAdults ?? 1,
          kidsCount: leadDefaults?.guestsKids ?? 0,
          infantCount: leadDefaults?.guestsInfants ?? 0,
          adultCostPerPerson: 0,
          kidsCostPerPerson: 0,
          b2bAdultAmount: 0,
          b2bKidAmount: 0,
          advance: 0,
          includesFood: false,
          notes: "",
          description: "",
          resortName: "",
          source: "",
          location: "",
          statusId: statuses[0]?.id ?? "",
          leadId: lockedLeadId ?? "",
          assignedToId: "",
          packageId:
            leadDefaults?.packageId && packages.some((p) => p.id === leadDefaults.packageId)
              ? leadDefaults.packageId
              : "",
        },
  });

  const [
    watchedNights,
    watchedAdultCount,
    watchedKidsCount,
    watchedAdultCost,
    watchedKidsCost,
    watchedB2BAdult,
    watchedB2BKid,
    watchedAdvance,
    watchedCheckInDate,
    watchedCheckOutDate,
    watchedPackageId,
    watchedStatusId,
    watchedStayType,
  ] = form.watch([
    "nights",
    "adultCount",
    "kidsCount",
    "adultCostPerPerson",
    "kidsCostPerPerson",
    "b2bAdultAmount",
    "b2bKidAmount",
    "advance",
    "checkInDate",
    "checkOutDate",
    "packageId",
    "statusId",
    "stayType",
  ]);

  const selectedPackage = packages.find((p) => p.id === watchedPackageId);
  const selectedStatus = statuses.find((s) => s.id === watchedStatusId);
  const isVilla = watchedStayType === "VILLA";

  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");

  // Villas don't split cost by kid vs adult — zero out the kid-specific
  // rates when switching to Villa so no stale value lingers unused.
  useEffect(() => {
    if (isVilla) {
      form.setValue("kidsCostPerPerson", 0);
      form.setValue("b2bKidAmount", 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVilla]);

  // Nights is derived from the date range whenever both dates are set —
  // check-out is always on or after check-in (enforced by the schema
  // refine), so this is always >= 0. diffDays === 0 is a same-day
  // ("one day package") booking and should sync nights to 0, not leave
  // whatever stale value was there before.
  useEffect(() => {
    if (!watchedCheckInDate || !watchedCheckOutDate) return;
    const diffDays = Math.round(
      (watchedCheckOutDate.getTime() - watchedCheckInDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays >= 0 && diffDays !== watchedNights) {
      form.setValue("nights", diffDays, { shouldValidate: true });
    }
  }, [watchedCheckInDate, watchedCheckOutDate, watchedNights, form]);

  const preview = previewFinancials({
    nights: numberOr(Number(watchedNights), 1),
    adultCount: numberOr(Number(watchedAdultCount), 0),
    kidsCount: numberOr(Number(watchedKidsCount), 0),
    adultCostPerPerson: numberOr(Number(watchedAdultCost), 0),
    kidsCostPerPerson: numberOr(Number(watchedKidsCost), 0),
    b2bAdultAmount: numberOr(Number(watchedB2BAdult), 0),
    b2bKidAmount: numberOr(Number(watchedB2BKid), 0),
    advance: numberOr(Number(watchedAdvance), 0),
    isVilla,
  });

  async function onSubmit(values: BookingFormValues) {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("guestName", values.guestName);
      formData.set("phone", values.phone);
      formData.set("email", values.email);
      formData.set("checkInDate", values.checkInDate.toISOString());
      formData.set("checkOutDate", values.checkOutDate.toISOString());
      formData.set("nights", String(values.nights));
      formData.set("stayType", values.stayType);
      formData.set("adultCount", String(values.adultCount));
      formData.set("kidsCount", String(values.kidsCount));
      formData.set("infantCount", String(values.infantCount));
      formData.set("adultCostPerPerson", String(values.adultCostPerPerson));
      formData.set("kidsCostPerPerson", String(values.kidsCostPerPerson));
      formData.set("b2bAdultAmount", String(values.b2bAdultAmount));
      formData.set("b2bKidAmount", String(values.b2bKidAmount));
      formData.set("advance", String(values.advance));
      formData.set("includesFood", String(values.includesFood));
      formData.set("notes", values.notes);
      formData.set("description", values.description);
      formData.set("resortName", values.resortName);
      formData.set("source", values.source);
      formData.set("location", values.location);
      formData.set("statusId", values.statusId);
      formData.set("assignedToId", values.assignedToId);
      if (values.leadId) formData.set("leadId", values.leadId);
      if (values.packageId) formData.set("packageId", values.packageId);
      if (file) formData.set("attachment", file);
      if (mode === "edit" && removeAttachment) formData.set("removeAttachment", "true");

      const res = await fetch(
        mode === "create" ? "/api/bookings" : `/api/bookings/${booking!.id}`,
        { method: mode === "create" ? "POST" : "PATCH", body: formData }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save booking");
        return;
      }

      // Selecting a "requires follow-up" status (e.g. Follow-up, Call Back)
      // schedules the date/time picked below via the same endpoint the old
      // per-lead Follow-ups panel used — it also syncs Lead.followUpDate.
      const leadIdForFollowUp = values.leadId || lockedLeadId;
      if (selectedStatus?.requiresFollowUp && followUpAt && leadIdForFollowUp) {
        const followUpRes = await fetch(`/api/leads/${leadIdForFollowUp}/follow-ups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dueAt: new Date(followUpAt).toISOString(),
            note: followUpNote || undefined,
          }),
        });
        if (!followUpRes.ok) {
          const data = await followUpRes.json().catch(() => ({}));
          toast.error(data.error ?? "Booking saved, but the follow-up date failed to save");
        }
      }

      toast.success(mode === "create" ? "Booking created" : "Booking updated");
      if (mode === "create") {
        form.reset();
        setFile(null);
      }
      setFollowUpAt("");
      setFollowUpNote("");
      router.refresh();
      onDone?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mode === "create" ? "Add a New Booking" : "Edit Booking"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="guestName"
                render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Aarav Sharma" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mob No</FormLabel>
                    <FormControl>
                      <Input placeholder="9876543210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="guest@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adultCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adult</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="kidsCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kid</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="infantCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Infant</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="checkInDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-In Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? toDateInputValue(field.value.toISOString()) : ""}
                        onChange={(e) => field.onChange(e.target.valueAsDate)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOutDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-out Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? toDateInputValue(field.value.toISOString()) : ""}
                        onChange={(e) => field.onChange(e.target.valueAsDate)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nights"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Night</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stayType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stay Type</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(STAY_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="packageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Package Name</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None">
                            {(v: string) => (
                              <span className="truncate">
                                {v === "none"
                                  ? "None"
                                  : (packages.find((p) => p.id === v)?.name ?? "None")}
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {packages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.destination ? ` — ${p.destination}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resortName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resort Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Resort name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unassigned">
                            {(v: string) => (
                              <span className="truncate">
                                {v === "none"
                                  ? "Unassigned"
                                  : (users.find((u) => u.id === v)?.name ?? "Unassigned")}
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adultCostPerPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isVilla ? "Total Amount" : "Per Person Amount"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isVilla && (
                <FormField
                  control={form.control}
                  name="kidsCostPerPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Per Kid Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="b2bAdultAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isVilla ? "Total Vendor Amount" : "B2B Per Adult"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isVilla && (
                <FormField
                  control={form.control}
                  name="b2bKidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>B2B Per Kid</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="advance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Advance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="statusId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: string) => {
                              const current = statuses.find((s) => s.id === v);
                              return current ? (
                                <LeadStatusBadge name={current.name} color={current.color} />
                              ) : null;
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="includesFood"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Include Food</FormLabel>
                    <div className="flex h-9 items-center gap-2">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                      <Label className="text-muted-foreground font-normal">
                        {field.value ? "Yes" : "No"}
                      </Label>
                    </div>
                  </FormItem>
                )}
              />
              {!lockedLeadId && (
                <FormField
                  control={form.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked Lead</FormLabel>
                      <Select
                        value={field.value || "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None">
                              {(v: string) => (
                                <span className="truncate">
                                  {v === "none"
                                    ? "None"
                                    : (leads.find((l) => l.id === v)?.fullName ?? "None")}
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {leads.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {selectedPackage && (
              <div className="bg-muted/50 flex gap-3 rounded-lg border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- served from our own file route, not next/image-optimizable */}
                <img
                  src={`/api/public/files/${selectedPackage.imagePath}`}
                  alt={selectedPackage.name}
                  className="size-20 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {selectedPackage.name}
                    {selectedPackage.destination ? ` — ${selectedPackage.destination}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {selectedPackage.type} · Up to {selectedPackage.maxGuests} guests · ₹
                    {Number(selectedPackage.price).toLocaleString("en-IN")} {selectedPackage.priceUnit}
                  </p>
                  <p className="text-muted-foreground mt-1 line-clamp-2">
                    {selectedPackage.description}
                  </p>
                </div>
              </div>
            )}

            {selectedStatus?.requiresFollowUp && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Follow-up Date &amp; Time</Label>
                  <Input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Follow-up Note (optional)</Label>
                  <Input
                    placeholder="Note for the follow-up"
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted/50 grid grid-cols-2 gap-3 rounded-lg border px-4 py-3 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">Total Amount</p>
                <p className="text-lg font-semibold">₹{preview.totalRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Vendor</p>
                <p className="text-lg font-semibold">₹{preview.vendorAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Balance Amt</p>
                <p className="text-lg font-semibold">₹{preview.balanceAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Our Profit</p>
                <p
                  className={`text-lg font-semibold ${preview.profit < 0 ? "text-red-600" : "text-green-600"}`}
                >
                  ₹{preview.profit.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Attachment (payment screenshot / ID)</label>
              {booking?.attachmentPath && !removeAttachment && !file && (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <a
                    href={`/api/files/${booking.attachmentPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline"
                  >
                    <Paperclip className="size-3.5" />
                    {booking.attachmentName ?? "View attachment"}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setRemoveAttachment(true)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setRemoveAttachment(false);
                }}
              />
            </div>

            <div className="flex justify-end gap-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (mode === "create") form.reset();
                    onCancel();
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                {mode === "create" ? "Create Booking" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
