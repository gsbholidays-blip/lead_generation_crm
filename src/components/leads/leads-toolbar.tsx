"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { Search, Download, FileSpreadsheet, FileText, CalendarIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";

type Option = { id: string; name: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toDateParam(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const SOURCES = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MANUAL", label: "Manual" },
  { value: "WEBSITE", label: "Website" },
  { value: "OTHER", label: "Other" },
];

const ALL = "__all__";

export function LeadsToolbar({
  statuses,
  users,
  showAssigneeFilter,
  canReassign,
}: {
  statuses: Option[];
  users: Option[];
  showAssigneeFilter: boolean;
  canReassign: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createdFrom = searchParams.get("createdFrom");
  const createdTo = searchParams.get("createdTo");
  const createdRange: DateRange | undefined = createdFrom
    ? { from: new Date(createdFrom), to: createdTo ? new Date(createdTo) : new Date(createdFrom) }
    : undefined;

  const checkInFrom = searchParams.get("checkInFrom");
  const checkInTo = searchParams.get("checkInTo");
  const checkInRange: DateRange | undefined = checkInFrom
    ? { from: new Date(checkInFrom), to: checkInTo ? new Date(checkInTo) : new Date(checkInFrom) }
    : undefined;

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === ALL || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (search !== (searchParams.get("q") ?? "")) {
        updateParams({ q: search || null });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleCreatedRangeSelect(selected: DateRange | undefined) {
    updateParams({
      createdFrom: selected?.from ? toDateParam(selected.from) : null,
      createdTo: selected?.to
        ? toDateParam(selected.to)
        : selected?.from
          ? toDateParam(selected.from)
          : null,
    });
  }

  const hasCreatedDateFilter = !!createdFrom;

  function handleCheckInRangeSelect(selected: DateRange | undefined) {
    updateParams({
      checkInFrom: selected?.from ? toDateParam(selected.from) : null,
      checkInTo: selected?.to
        ? toDateParam(selected.to)
        : selected?.from
          ? toDateParam(selected.from)
          : null,
    });
  }

  const hasCheckInDateFilter = !!checkInFrom;

  function exportUrl(format: "csv" | "xlsx") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("format", format);
    params.delete("page");
    params.delete("pageSize");
    return `/api/leads/export?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search name, phone, email..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={searchParams.get("statusId") ?? ALL}
          onValueChange={(v) => updateParams({ statusId: v })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status">
              {(v: string) =>
                v === ALL ? "All Statuses" : (statuses.find((s) => s.id === v)?.name ?? "Status")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("source") ?? ALL}
          onValueChange={(v) => updateParams({ source: v })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source">
              {(v: string) =>
                v === ALL ? "All Sources" : (SOURCES.find((s) => s.value === v)?.label ?? "Source")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Sources</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showAssigneeFilter && (
          <Select
            value={searchParams.get("assignedToId") ?? ALL}
            onValueChange={(v) => updateParams({ assignedToId: v })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Assigned To">
                {(v: string) =>
                  v === ALL
                    ? "Everyone"
                    : v === "unassigned"
                      ? "Unassigned"
                      : (users.find((u) => u.id === v)?.name ?? "Assigned To")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Popover>
          <PopoverTrigger render={<Button variant="outline" className="justify-start font-normal" />}>
            <CalendarIcon className="size-4" />
            {hasCreatedDateFilter ? (
              <span>
                {formatDate(createdFrom!)}
                {createdTo && createdTo !== createdFrom ? ` – ${formatDate(createdTo)}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Created date</span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="range"
              selected={createdRange}
              onSelect={handleCreatedRangeSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {hasCreatedDateFilter && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Clear date filter"
            onClick={() => updateParams({ createdFrom: null, createdTo: null })}
          >
            <X className="size-3.5" />
          </Button>
        )}

        <Popover>
          <PopoverTrigger render={<Button variant="outline" className="justify-start font-normal" />}>
            <CalendarIcon className="size-4" />
            {hasCheckInDateFilter ? (
              <span>
                {formatDate(checkInFrom!)}
                {checkInTo && checkInTo !== checkInFrom ? ` – ${formatDate(checkInTo)}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Check-in date</span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="range"
              selected={checkInRange}
              onSelect={handleCheckInRangeSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {hasCheckInDateFilter && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Clear check-in date filter"
            onClick={() => updateParams({ checkInFrom: null, checkInTo: null })}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <Download />
            Export
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<a href={exportUrl("csv")} download />}>
              <FileText />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={exportUrl("xlsx")} download />}>
              <FileSpreadsheet />
              Export as Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AddLeadDialog statuses={statuses} users={users} canReassign={canReassign} />
      </div>
    </div>
  );
}
