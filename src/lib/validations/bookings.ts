import { z } from "zod";

export const BOOKING_SORT_FIELDS = [
  "createdAt",
  "checkInDate",
  "guestName",
  "totalRevenue",
] as const;

export const bookingListQuerySchema = z.object({
  q: z.string().trim().optional(),
  statusId: z.string().optional(),
  leadId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(BOOKING_SORT_FIELDS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

export const STAY_TYPES = [
  "VILLA",
  "TENT_CAMPING",
  "COTTAGE",
  "FARM_HOUSE",
  "GLAMPING",
  "RESORT",
] as const;
export const BOOKING_LOCATIONS = ["LONAVALA", "KARJAT", "ALIBAGH", "PANVEL"] as const;
export const BOOKING_SOURCES = [
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "MANUAL",
  "WEBSITE",
  "OTHER",
] as const;

// Legacy (leadId/packageId) fields: `""` is normalized away to `undefined` at
// parse time, so the API routes only ever send this key at all when there's
// a real value to link — see booking-form-dialog's `if (values.x) formData.set(...)`.
const legacyOptionalId = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

// New optional fields: NO transform — `""` is preserved as-is (distinct from
// `undefined`) so the update route can tell "explicitly cleared" (`""`) apart
// from "not part of this request" (`undefined`) via `input.x === "" ? null : input.x`.
// On create, the route filters `formData.get(x) || undefined` before this
// schema ever sees it, so `""` never reaches create validation anyway.
const clearableText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const clearableId = z.string().optional().or(z.literal(""));
const clearableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().or(z.literal(""));

const rawBookingFields = {
  guestName: z.string().trim().min(1, "Guest name is required").max(200),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  email: clearableText(200),
  checkInDate: z.coerce.date({ message: "Check-in date is required" }),
  checkOutDate: z.coerce.date({ message: "Check-out date is required" }),
  // min(0), not min(1): a same-day ("one day package") booking has
  // checkOutDate === checkInDate and 0 nights stayed.
  nights: z.coerce.number().int().min(0),
  stayType: clearableEnum(STAY_TYPES),
  adultCount: z.coerce.number().int().min(1, "At least 1 adult is required"),
  kidsCount: z.coerce.number().int().min(0),
  infantCount: z.coerce.number().int().min(0),
  adultCostPerPerson: z.coerce.number().min(0, "Per person amount cannot be negative"),
  kidsCostPerPerson: z.coerce.number().min(0),
  b2bAdultAmount: z.coerce.number().min(0),
  b2bKidAmount: z.coerce.number().min(0),
  advance: z.coerce.number().min(0),
  // Plain z.boolean(), NOT z.coerce.boolean() — the latter uses JS `Boolean()`
  // coercion, where the string "false" is truthy. Routes convert the
  // "true"/"false" FormData string to a real boolean before this runs.
  includesFood: z.boolean(),
  notes: clearableText(2000),
  description: clearableText(2000),
  resortName: clearableText(200),
  source: clearableEnum(BOOKING_SOURCES),
  location: clearableEnum(BOOKING_LOCATIONS),
  // Same admin-configurable status list as leads (LeadStatus), not a fixed
  // Confirmed/Cancelled enum — see Booking.statusId in schema.prisma.
  statusId: z.string().min(1, "Status is required"),
  leadId: legacyOptionalId,
  packageId: legacyOptionalId,
  assignedToId: clearableId,
};

// On create there's no "explicitly clear" concept — the route already
// filters `formData.get(x) || undefined` before parsing, so "" never
// actually reaches here. These transforms only narrow the TYPE to match
// (Prisma's create input rejects "" for these enum columns).
export const createBookingSchema = z
  .object({
    ...rawBookingFields,
    nights: rawBookingFields.nights.default(1),
    kidsCount: rawBookingFields.kidsCount.default(0),
    infantCount: rawBookingFields.infantCount.default(0),
    kidsCostPerPerson: rawBookingFields.kidsCostPerPerson.default(0),
    b2bAdultAmount: rawBookingFields.b2bAdultAmount.default(0),
    b2bKidAmount: rawBookingFields.b2bKidAmount.default(0),
    advance: rawBookingFields.advance.default(0),
    includesFood: rawBookingFields.includesFood.default(false),
    stayType: rawBookingFields.stayType.transform((v) => (v === "" ? undefined : v)),
    source: rawBookingFields.source.transform((v) => (v === "" ? undefined : v)),
    location: rawBookingFields.location.transform((v) => (v === "" ? undefined : v)),
  })
  .refine((data) => data.checkOutDate >= data.checkInDate, {
    message: "Check-out date must be on or after check-in date",
    path: ["checkOutDate"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// Client-form-only variant: react-hook-form's `valueAsDate`/`valueAsNumber`
// register options already deliver real Date/number values from the DOM, so
// this uses plain z.date()/z.number() (input type === output type) instead
// of the server schema's z.coerce.* (whose input type is `unknown`, which
// breaks zodResolver's generic inference against typed defaultValues).
export const bookingFormSchema = z
  .object({
    guestName: rawBookingFields.guestName,
    phone: rawBookingFields.phone,
    email: z.string(),
    checkInDate: z.date({ message: "Check-in date is required" }),
    checkOutDate: z.date({ message: "Check-out date is required" }),
    // min(0), not min(1): a same-day ("one day package") booking has
    // checkOutDate === checkInDate and 0 nights stayed.
    nights: z.number().int().min(0),
    stayType: z.string(),
    adultCount: z.number().int().min(1, "At least 1 adult is required"),
    kidsCount: z.number().int().min(0),
    infantCount: z.number().int().min(0),
    adultCostPerPerson: z.number().min(0, "Per person amount cannot be negative"),
    kidsCostPerPerson: z.number().min(0),
    b2bAdultAmount: z.number().min(0),
    b2bKidAmount: z.number().min(0),
    advance: z.number().min(0),
    includesFood: z.boolean(),
    notes: z.string(),
    description: z.string(),
    resortName: z.string(),
    source: z.string(),
    location: z.string(),
    // Plain required string (not optional/undefined) — "" is the "none
    // selected" sentinel, since react-hook-form always supplies a value for
    // every registered field and optional-key typing fights zodResolver's
    // generic inference here.
    leadId: z.string(),
    packageId: z.string(),
    assignedToId: z.string(),
    statusId: z.string().min(1, "Status is required"),
  })
  .refine((data) => data.checkOutDate >= data.checkInDate, {
    message: "Check-out date must be on or after check-in date",
    path: ["checkOutDate"],
  });

export type BookingFormValues = z.infer<typeof bookingFormSchema>;

export const updateBookingSchema = z
  .object({
    guestName: rawBookingFields.guestName.optional(),
    phone: rawBookingFields.phone.optional(),
    email: rawBookingFields.email,
    checkInDate: rawBookingFields.checkInDate.optional(),
    checkOutDate: rawBookingFields.checkOutDate.optional(),
    nights: rawBookingFields.nights.optional(),
    stayType: rawBookingFields.stayType,
    adultCount: rawBookingFields.adultCount.optional(),
    kidsCount: rawBookingFields.kidsCount.optional(),
    infantCount: rawBookingFields.infantCount.optional(),
    adultCostPerPerson: rawBookingFields.adultCostPerPerson.optional(),
    kidsCostPerPerson: rawBookingFields.kidsCostPerPerson.optional(),
    b2bAdultAmount: rawBookingFields.b2bAdultAmount.optional(),
    b2bKidAmount: rawBookingFields.b2bKidAmount.optional(),
    advance: rawBookingFields.advance.optional(),
    includesFood: rawBookingFields.includesFood.optional(),
    notes: rawBookingFields.notes,
    description: rawBookingFields.description,
    resortName: rawBookingFields.resortName,
    source: rawBookingFields.source,
    location: rawBookingFields.location,
    statusId: rawBookingFields.statusId.optional(),
    leadId: rawBookingFields.leadId,
    packageId: rawBookingFields.packageId,
    assignedToId: rawBookingFields.assignedToId,
    removeAttachment: z.coerce.boolean().optional(),
  })
  .refine(
    (data) =>
      !data.checkInDate || !data.checkOutDate || data.checkOutDate >= data.checkInDate,
    { message: "Check-out date must be on or after check-in date", path: ["checkOutDate"] }
  );

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
