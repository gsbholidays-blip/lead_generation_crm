"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Search, X } from "lucide-react";
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

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "DONE", label: "Done" },
  { value: "MISSED", label: "Missed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All Statuses" },
];

type LeadStatusOption = { id: string; name: string };

const ALL_LEAD_STATUSES = "__all__";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toDateParam(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function FollowUpsToolbar({ statuses }: { statuses: LeadStatusOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enquiredFrom = searchParams.get("enquiredFrom");
  const enquiredTo = searchParams.get("enquiredTo");
  const range: DateRange | undefined = enquiredFrom
    ? { from: new Date(enquiredFrom), to: enquiredTo ? new Date(enquiredTo) : new Date(enquiredFrom) }
    : undefined;

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(range);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === ALL_LEAD_STATUSES) params.delete(key);
      else params.set(key, value);
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

  function commitRange(selected: DateRange | undefined) {
    updateParams({
      enquiredFrom: selected?.from ? toDateParam(selected.from) : null,
      enquiredTo: selected?.to ? toDateParam(selected.to) : selected?.from ? toDateParam(selected.from) : null,
    });
  }

  // Keep the in-progress range selection local while the popover is open —
  // committing to the URL (and therefore re-deriving `range` as the Calendar's
  // controlled `selected`) after every single click collapsed the second click
  // into a brand-new selection instead of completing the range.
  function handleRangeSelect(selected: DateRange | undefined) {
    setPendingRange(selected);
    if (selected?.from && selected?.to) {
      commitRange(selected);
      setDatePopoverOpen(false);
    }
  }

  function handleDatePopoverOpenChange(open: boolean) {
    setDatePopoverOpen(open);
    if (open) {
      setPendingRange(range);
    } else {
      commitRange(pendingRange);
    }
  }

  const hasDateFilter = !!enquiredFrom;

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search name, phone..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Select
        value={searchParams.get("status") ?? "PENDING"}
        onValueChange={(v) => updateParams({ status: v })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status">
            {(v: string) => STATUS_OPTIONS.find((s) => s.value === v)?.label ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("leadStatusId") ?? ALL_LEAD_STATUSES}
        onValueChange={(v) => updateParams({ leadStatusId: v })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Lead Status">
            {(v: string) =>
              v === ALL_LEAD_STATUSES ? "All Lead Statuses" : (statuses.find((s) => s.id === v)?.name ?? "Lead Status")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_LEAD_STATUSES}>All Lead Statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={datePopoverOpen} onOpenChange={handleDatePopoverOpenChange}>
        <PopoverTrigger render={<Button variant="outline" className="justify-start font-normal" />}>
          <CalendarIcon className="size-4" />
          {hasDateFilter ? (
            <span>
              {formatDate(enquiredFrom!)}
              {enquiredTo && enquiredTo !== enquiredFrom ? ` – ${formatDate(enquiredTo)}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Enquiry date</span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="range"
            selected={pendingRange}
            onSelect={handleRangeSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {hasDateFilter && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Clear date filter"
          onClick={() => updateParams({ enquiredFrom: null, enquiredTo: null })}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
