"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  SearchX,
  Trash2,
  Users2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { SourceBadge } from "@/components/leads/source-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

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

type LeadRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  packageInterest: string | null;
  source: string;
  invoiceNumber: string | null;
  createdAt: string;
  followUpDate: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  statusId: string;
  status: { id: string; name: string; color: string };
  assignedTo: { id: string; name: string } | null;
};

type Option = { id: string; name: string };

const UNASSIGNED = "unassigned";

function formatShortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function LeadsTable({
  leads,
  users,
  canReassign,
  total,
  page,
  pageSize,
  totalPages,
  sortBy,
  sortDir,
  canDelete,
}: {
  leads: LeadRow[];
  users: Option[];
  canReassign: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  canDelete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasActiveFilters = [
    "q",
    "statusId",
    "source",
    "assignedToId",
    "createdFrom",
    "createdTo",
    "checkIn",
    "checkOut",
  ].some((key) => searchParams.get(key));

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
      updateParams({ sortBy: field, sortDir: "desc" });
    }
  }

  async function patchLead(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Update failed");
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Delete failed");
      return;
    }
    toast.success("Lead deleted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("overflow-x-auto rounded-lg border", isPending && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>
                <SortHeader
                  field="fullName"
                  label="Name"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>Check-in/Check-out</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>
                <SortHeader
                  field="followUpDate"
                  label="Follow-up"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assign</TableHead>
              <TableHead>
                <SortHeader
                  field="createdAt"
                  label="Enquiry date"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              {canDelete && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 10 : 9} className="h-40 text-center">
                  {hasActiveFilters ? (
                    <EmptyState
                      icon={SearchX}
                      title="No leads match your filters"
                      description="Try clearing a filter or searching for something else."
                      size="sm"
                    />
                  ) : (
                    <EmptyState
                      icon={Users2}
                      title="No leads yet"
                      description="Leads synced from Meta or added manually will show up here."
                      size="sm"
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} className="group">
                  <TableCell
                    className="text-muted-foreground cursor-pointer text-sm whitespace-nowrap"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    {lead.invoiceNumber ?? "—"}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    <div className="font-medium">{lead.fullName}</div>
                    <div className="text-muted-foreground text-xs">{lead.phone}</div>
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground cursor-pointer text-sm whitespace-nowrap"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    {lead.checkInDate || lead.checkOutDate
                      ? `${formatShortDate(lead.checkInDate) ?? "—"} – ${formatShortDate(lead.checkOutDate) ?? "—"}`
                      : "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-[180px] cursor-pointer truncate text-sm"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    {lead.packageInterest ?? "—"}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer text-sm"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    {lead.followUpDate ? (
                      <span
                        className={
                          new Date(lead.followUpDate) < new Date() ? "font-medium text-red-600" : ""
                        }
                      >
                        {new Date(lead.followUpDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <SourceBadge source={lead.source} />
                  </TableCell>
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    <LeadStatusBadge name={lead.status.name} color={lead.status.color} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canReassign ? (
                      <Select
                        value={lead.assignedTo?.id ?? UNASSIGNED}
                        onValueChange={(v) =>
                          patchLead(lead.id, { assignedToId: v === UNASSIGNED ? null : v })
                        }
                      >
                        <SelectTrigger className="h-7 w-[150px] border-none bg-transparent px-1 shadow-none">
                          <SelectValue>
                            {lead.assignedTo?.name ?? "Unassigned"}
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
                      <span className="text-sm">{lead.assignedTo?.name ?? "Unassigned"}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground cursor-pointer text-sm whitespace-nowrap"
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    {new Date(lead.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  {canDelete && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" className="size-7" />}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(lead.id, lead.fullName)}
                          >
                            <Trash2 />
                            Delete lead
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          Showing {leads.length === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)} of {total} leads
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
    </div>
  );
}
