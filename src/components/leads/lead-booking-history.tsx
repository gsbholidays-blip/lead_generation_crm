"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarCheck2, Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingForm, type BookingRow } from "@/components/bookings/booking-form";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadBookingHistory({
  leadId,
  leadDefaults,
  bookings,
  packages,
  users,
  statuses,
  canManage,
  canDelete,
  canCancel,
}: {
  leadId: string;
  leadDefaults: {
    fullName: string;
    phone: string;
    email: string | null;
    checkInDate: string | null;
    checkOutDate: string | null;
    guestsAdults: number | null;
    guestsKids: number | null;
    guestsInfants: number | null;
    packageId: string | null;
  };
  bookings: BookingRow[];
  packages: PackageOption[];
  users: UserOption[];
  statuses: StatusOption[];
  canManage: boolean;
  canDelete: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [editingBooking, setEditingBooking] = useState<BookingRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(bookings.length === 0);

  async function handleDelete(booking: BookingRow) {
    if (!confirm(`Delete booking for "${booking.guestName}"? This cannot be undone.`)) return;
    setDeletingId(booking.id);
    const res = await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Delete failed");
      return;
    }
    toast.success("Booking deleted");
    if (editingBooking?.id === booking.id) setEditingBooking(null);
    router.refresh();
  }

  async function handleStatusChange(booking: BookingRow, statusId: string) {
    const formData = new FormData();
    formData.set("statusId", statusId);
    const res = await fetch(`/api/bookings/${booking.id}`, { method: "PATCH", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  async function handleCancel(booking: BookingRow) {
    if (!confirm(`Cancel booking for "${booking.guestName}"? This cannot be undone.`)) return;
    setCancellingId(booking.id);
    const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: "POST" });
    setCancellingId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Cancel failed");
      return;
    }
    toast.success("Booking cancelled");
    if (editingBooking?.id === booking.id) setEditingBooking(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (editingBooking || showCreateForm) && (
        <BookingForm
          key={editingBooking?.id ?? "create"}
          mode={editingBooking ? "edit" : "create"}
          booking={editingBooking ?? undefined}
          leads={[]}
          packages={packages}
          users={users}
          statuses={statuses}
          lockedLeadId={leadId}
          leadDefaults={leadDefaults}
          onDone={() => {
            setEditingBooking(null);
            setShowCreateForm(false);
          }}
          onCancel={() => {
            setEditingBooking(null);
            setShowCreateForm(false);
          }}
        />
      )}

      {canManage && bookings.length === 0 && !editingBooking && !showCreateForm && (
        <Button variant="outline" className="w-full" onClick={() => setShowCreateForm(true)}>
          <Plus />
          Add Booking
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking History</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title="No bookings yet"
              description="Confirmed stays for this lead will show up here."
              size="sm"
            />
          ) : (
            <div className="flex flex-col divide-y">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className={`-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 text-sm ${
                    booking.isCancelled ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {booking.packageName ?? "No package"} · {booking.adultCount} Adult
                      {booking.adultCount === 1 ? "" : "s"}
                      {booking.kidsCount > 0 ? ` · ${booking.kidsCount} Kids` : ""}
                    </div>
                    {booking.attachmentPath && (
                      <a
                        href={`/api/files/${booking.attachmentPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Paperclip className="size-3" />
                        {booking.attachmentName ?? "View attachment"}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-medium">
                      ₹{Number(booking.totalRevenue).toLocaleString("en-IN")}
                    </span>
                    {booking.isCancelled ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : canManage ? (
                      <Select
                        value={booking.statusId}
                        onValueChange={(v) => v && handleStatusChange(booking, v)}
                      >
                        <SelectTrigger className="h-7 w-auto border-none bg-transparent px-1 shadow-none">
                          <SelectValue>
                            <LeadStatusBadge name={booking.status.name} color={booking.status.color} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <LeadStatusBadge name={booking.status.name} color={booking.status.color} />
                    )}
                    {canManage && !booking.isCancelled && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingBooking(booking)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    {canCancel && !booking.isCancelled && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCancel(booking)}
                        disabled={cancellingId === booking.id}
                      >
                        {cancellingId === booking.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Ban className="size-3.5" />
                        )}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(booking)}
                        disabled={deletingId === booking.id}
                      >
                        {deletingId === booking.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
