"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";

const STATUS_FILTERS = ["all", "open", "wip", "ready_to_close", "closed"] as const;

const SELECT_FILTERS: { key: string; label: string; options: Record<string, string> }[] = [
  { key: "category", label: "Category", options: CATEGORY_LABELS },
  { key: "sub_category", label: "Sub-category", options: SUB_CATEGORY_LABELS },
  { key: "location", label: "Location", options: LOCATION_LABELS },
  { key: "scope", label: "Scope", options: SCOPE_LABELS },
  { key: "severity", label: "Severity", options: SEVERITY_LABELS },
];

export function SnagFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Filters as you type, debounced instead of waiting for Enter/submit.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) {
        updateParam("q", q);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateParam("status", s)}
            className={`rounded-pill border px-2.5 py-1 text-[11.5px] ${
              status === s
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search description…"
          className="ml-auto rounded-md border border-input bg-background px-2.5 py-1 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SELECT_FILTERS.map((f) => (
          <select
            key={f.key}
            value={searchParams.get(f.key) ?? "all"}
            onChange={(e) => updateParam(f.key, e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-[11.5px] text-foreground"
          >
            <option value="all">{f.label}: All</option>
            {Object.entries(f.options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
