"use client";

import { useEffect, useRef, useState } from "react";

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
  emptySuffix = ": All",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  // Table filters read correctly as "Status: All" when nothing's picked —
  // no filter means every row matches. That's not true everywhere this
  // component is reused (e.g. an invite form, where nothing picked means
  // no warehouse tag at all, not "all warehouses") — callers there should
  // pass "" so the button just reads as a plain placeholder.
  emptySuffix?: string;
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

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2 py-1 text-[11.5px] font-medium ${
          selected.length > 0
            ? "border-primary bg-accent text-accent-foreground"
            : "border-teal bg-frost text-teal-deep"
        } ${className ?? ""}`}
      >
        {label}
        {selected.length > 0 ? ` (${selected.length})` : emptySuffix}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-2.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
            >
              Clear
            </button>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="accent-primary"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
