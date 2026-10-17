"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";

type Option = { id: string; name: string };

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

  const createdFrom = searchParams.get("createdFrom") ?? "";
  const createdTo = searchParams.get("createdTo") ?? "";
  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";

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

        <div className="flex items-center gap-1.5">
          <Label htmlFor="createdFrom" className="text-muted-foreground text-xs whitespace-nowrap">
            Enquiry date
          </Label>
          <Input
            id="createdFrom"
            type="date"
            className="w-[150px]"
            value={createdFrom}
            onChange={(e) => updateParams({ createdFrom: e.target.value || null })}
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            id="createdTo"
            type="date"
            className="w-[150px]"
            value={createdTo}
            onChange={(e) => updateParams({ createdTo: e.target.value || null })}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="checkIn" className="text-muted-foreground text-xs whitespace-nowrap">
            Check-in
          </Label>
          <Input
            id="checkIn"
            type="date"
            className="w-[150px]"
            value={checkIn}
            onChange={(e) => updateParams({ checkIn: e.target.value || null })}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="checkOut" className="text-muted-foreground text-xs whitespace-nowrap">
            Check-out
          </Label>
          <Input
            id="checkOut"
            type="date"
            className="w-[150px]"
            value={checkOut}
            onChange={(e) => updateParams({ checkOut: e.target.value || null })}
          />
        </div>
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
