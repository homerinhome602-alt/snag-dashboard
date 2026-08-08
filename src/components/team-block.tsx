"use client";

import { useEffect, useRef, useState } from "react";
import { MEMBER_ROLES, ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

type Member = { role: string; full_name: string | null; email: string };

export function TeamBlock({ members }: { members: Member[] }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const byRole = new Map<string, Member[]>();
  for (const m of members) {
    byRole.set(m.role, [...(byRole.get(m.role) ?? []), m]);
  }
  const totalCount = members.length;

  if (totalCount === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-3">
        <div className="mb-1 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
        <p className="text-[12px] text-muted-foreground">No one tagged to this warehouse yet.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative rounded-card border border-border bg-card p-3">
      <div className="mb-2 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
          <span
            key={r.value}
            className={`rounded-pill border px-2 py-0.5 text-[11px] ${ROLE_COLOR_CLASS[r.value]}`}
          >
            {r.label} · {byRole.get(r.value)!.length}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pl-1 text-[12px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Show all {totalCount}
        </button>
      </div>

      {expanded && (
        <div className="absolute right-3 top-3 z-20 w-72 max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-card p-3 shadow-lg">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setExpanded(false)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
          <div className="mb-2 pr-6 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
          <div className="flex flex-col gap-2">
            {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
              <div key={r.value} className={`rounded-md border px-2.5 py-1.5 ${ROLE_COLOR_CLASS[r.value]}`}>
                <div className="text-[10.5px] font-medium opacity-80">{roleLabel(r.value)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {byRole.get(r.value)!.map((m, i) => (
                    <span key={i} className="text-[12px]">
                      {m.full_name ?? m.email}
                      {i < byRole.get(r.value)!.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
