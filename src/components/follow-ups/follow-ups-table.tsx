"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  SearchX,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

const UNASSIGNED = "unassigned";

function SortHeader({
  field,
  label,
  sortBy,
  sortDir,
  onToggle,
}: {
  field: string;
  label: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onToggle: (field: string) => void;
}) {
  const Icon = sortBy !== field ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
      onClick={() => onToggle(field)}
    >
      {label}
      <Icon className="size-3" />
    </button>
  );
}

function timingBadge(dueAt: string) {
  const due = new Date(dueAt);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (due < startOfToday) return { label: "Missed", className: "bg-red-500/10 text-red-600" };
  if (due < startOfTomorrow) return { label: "Today", className: "bg-blue-500/10 text-blue-600" };
  return { label: "Upcoming", className: "bg-muted text-muted-foreground" };
}

type FollowUpRow = {
  id: string;
  dueAt: string;
  note: string | null;
  leadId: string;
  lead: {
    id: string;
    fullName: string;
    phone: string;
    createdAt: string;
    status: { name: string; color: string };
    assignedTo: { id: string; name: string } | null;
  };
};

export function FollowUpsTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  sortBy,
  sortDir,
  showAssignee,
  users,
  canReassign,
}: {
  items: FollowUpRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  showAssignee: boolean;
  users: Option[];
  canReassign: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    leadId: string;
    status: "DONE" | "CANCELLED";
  } | null>(null);
  const hasActiveFilters = ["q", "status", "enquiredFrom", "enquiredTo"].some((key) =>
    searchParams.get(key)
  );

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function toggleSort(field: string) {
    if (sortBy === field) {
      updateParams({ sortBy: field, sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sortBy: field, sortDir: field === "dueAt" ? "asc" : "desc" });
    }
  }

  async function updateStatus(id: string, leadId: string, status: "DONE" | "CANCELLED") {
    const res = await fetch(`/api/leads/${leadId}/follow-ups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Failed to update follow-up");
      return;
    }
    router.refresh();
  }

  // Assignment lives on the Lead, not the follow-up — the same lead can have
  // several pending follow-up rows here, and reassigning from any one of them
  // updates the lead once, so every row for that lead reflects it immediately.
  async function assignLead(leadId: string, assignedToId: string | null) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to update assignment");
      return;
    }
    router.refresh();
  }

  const columnCount = showAssignee ? 7 : 6;

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("overflow-x-auto rounded-lg border", isPending && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader
                  field="fullName"
                  label="Lead"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>Status</TableHead>
              {showAssignee && <TableHead>Assigned To</TableHead>}
              <TableHead>
                <SortHeader
                  field="createdAt"
                  label="Enquired On"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  field="dueAt"
                  label="Follow-up Due"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-40 text-center">
                  {hasActiveFilters ? (
                    <EmptyState
                      icon={SearchX}
                      title="No follow-ups match your filters"
                      description="Try clearing the search or date filter."
                      size="sm"
                    />
                  ) : (
                    <EmptyState
                      icon={SearchX}
                      title="No pending follow-ups"
                      description="Nothing scheduled — you're all caught up."
                      size="sm"
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const timing = timingBadge(item.dueAt);
                return (
                  <TableRow key={item.id} className="group">
                    <TableCell
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/leads/${item.lead.id}`)}
                    >
                      <div className="font-medium hover:underline">{item.lead.fullName}</div>
                      <div className="text-muted-foreground text-xs">{item.lead.phone}</div>
                    </TableCell>
                    <TableCell>
                      <LeadStatusBadge name={item.lead.status.name} color={item.lead.status.color} />
                    </TableCell>
                    {showAssignee && (
                      <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                        {canReassign ? (
                          <Select
                            value={item.lead.assignedTo?.id ?? UNASSIGNED}
                            onValueChange={(v) =>
                              assignLead(item.lead.id, v === UNASSIGNED ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 w-[150px] border-none bg-transparent px-1 shadow-none">
                              <SelectValue>
                                {item.lead.assignedTo?.name ?? "Unassigned"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          item.lead.assignedTo?.name ?? "Unassigned"
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(item.lead.createdAt), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{format(new Date(item.dueAt), "d MMM, h:mm a")}</span>
                        <Badge className={cn("border-none", timing.className)}>{timing.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[220px] truncate text-sm">
                      {item.note ?? "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Mark done"
                          className="size-7 rounded-full border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                          onClick={() =>
                            setConfirmTarget({ id: item.id, leadId: item.leadId, status: "DONE" })
                          }
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Cancel follow-up"
                          className="size-7 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                          onClick={() =>
                            setConfirmTarget({ id: item.id, leadId: item.leadId, status: "CANCELLED" })
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          Showing {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)} of {total} follow-ups
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.status === "DONE" ? "Mark follow-up as done?" : "Cancel follow-up?"}
        description={
          confirmTarget?.status === "DONE"
            ? "This will mark the follow-up as completed."
            : "This cannot be undone."
        }
        confirmLabel={confirmTarget?.status === "DONE" ? "Mark done" : "Cancel follow-up"}
        cancelLabel="Back"
        variant={confirmTarget?.status === "CANCELLED" ? "destructive" : "default"}
        onConfirm={() => {
          if (confirmTarget) updateStatus(confirmTarget.id, confirmTarget.leadId, confirmTarget.status);
        }}
      />
    </div>
  );
}
