"use client";

import { useEffect, useRef, useState } from "react";

export type StatusFilterValue = "all" | "active" | "deactivated";

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
];

export function StatusFilter({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const currentLabel = OPTIONS.find((o) => o.value === value)?.label ?? "All";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2 py-1 text-[11.5px] ${
          value !== "all"
            ? "border-primary bg-accent text-accent-foreground"
            : "border-input bg-background text-foreground"
        }`}
      >
        Current status: {currentLabel}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card py-1 shadow-md">
          {value !== "all" && (
            <button
              type="button"
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
              className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
            >
              Clear
            </button>
          )}
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center px-2.5 py-1.5 text-left text-[12px] hover:bg-muted ${
                value === o.value ? "font-medium text-foreground" : "text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
