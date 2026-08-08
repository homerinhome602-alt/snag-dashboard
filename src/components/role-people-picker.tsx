"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_COLOR_CLASS, type MemberRole } from "@/lib/roles";

type Person = { id: string; full_name: string | null; email: string; default_role?: string | null };

function displayName(p: Person) {
  return p.full_name ?? p.email;
}

// Searchable multi-select combobox: selected people show as colored chips
// (colored by role, per the shared ROLE_COLOR_CLASS mapping), with a
// dropdown search box for adding more.
export function RolePeoplePicker({
  role,
  label,
  people,
  selected,
  onChange,
  lockedIds = [],
  onRemoveLocked,
}: {
  role: MemberRole;
  label: string;
  people: Person[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Already-a-member ids shown as locked chips (add-only flows unless onRemoveLocked is given). */
  lockedIds?: string[];
  /** When provided, locked chips get a small × to remove that person from this role. */
  onRemoveLocked?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const colorClass = ROLE_COLOR_CLASS[role];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const available = people
    .filter((p) => !selected.includes(p.id))
    .filter((p) => displayName(p).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const aMatch = a.default_role === role ? 0 : 1;
      const bMatch = b.default_role === role ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return displayName(a).localeCompare(displayName(b));
    });

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5"
        onClick={() => setOpen(true)}
      >
        {selected.map((id) => {
          const p = people.find((x) => x.id === id);
          if (!p) return null;
          const locked = lockedIds.includes(id);
          return locked ? (
            <span key={id} className={`flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] ${colorClass} ${onRemoveLocked ? "" : "opacity-70"}`}>
              {displayName(p)}
              {onRemoveLocked && (
                <button
                  type="button"
                  aria-label={`Remove ${displayName(p)} from ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLocked(id);
                  }}
                  className="text-current opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              )}
            </span>
          ) : (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(id);
              }}
              className={`rounded-pill border px-2 py-0.5 text-[11px] ${colorClass}`}
            >
              {displayName(p)} ×
            </button>
          );
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search or select…" : ""}
          className="min-w-[80px] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
          {available.length === 0 ? (
            <div className="px-2.5 py-2 text-[11.5px] text-muted-foreground">No matches</div>
          ) : (
            available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  toggle(p.id);
                  setQuery("");
                }}
                className="flex w-full items-center px-2.5 py-1.5 text-left text-[12px] hover:bg-muted"
              >
                {displayName(p)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
