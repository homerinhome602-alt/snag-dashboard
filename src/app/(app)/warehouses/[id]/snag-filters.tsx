"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { parseMulti } from "./filter-utils";

function toOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const FILTERS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  { key: "status", label: "Status", options: toOptions(STATUS_LABELS) },
  { key: "category", label: "Category", options: toOptions(CATEGORY_LABELS) },
  { key: "sub_category", label: "Sub-category", options: toOptions(SUB_CATEGORY_LABELS) },
  { key: "location", label: "Location", options: toOptions(LOCATION_LABELS) },
  { key: "scope", label: "Scope", options: toOptions(SCOPE_LABELS) },
  { key: "severity", label: "Severity", options: toOptions(SEVERITY_LABELS) },
];

export function SnagFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false); // mobile only

  function updateParam(key: string, values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length === 0) {
      params.delete(key);
    } else {
      params.set(key, values.join(","));
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeCount = FILTERS.filter((f) => searchParams.get(f.key)).length;

  return (
    <>
      {/* Mobile: one button that reveals the filters below sm; hidden at sm+ */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "rounded-md border px-2 py-2 text-[11.5px] font-medium sm:hidden",
          activeCount > 0
            ? "border-primary bg-accent text-accent-foreground"
            : "border-border text-muted-foreground"
        )}
      >
        Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>

      <div
        className={cn(
          "flex-wrap gap-2",
          open ? "flex w-full" : "hidden",
          "sm:flex sm:w-auto"
        )}
      >
        {FILTERS.map((f) => (
          <MultiSelectFilter
            key={f.key}
            label={f.label}
            options={f.options}
            selected={parseMulti(searchParams.get(f.key) ?? undefined)}
            onChange={(next) => updateParam(f.key, next)}
          />
        ))}
      </div>
    </>
  );
}
