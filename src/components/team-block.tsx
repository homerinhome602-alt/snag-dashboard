"use client";

import { useState } from "react";
import { MEMBER_ROLES, ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

type Member = { role: string; full_name: string | null; email: string };

export function TeamBlock({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false);

  const byRole = new Map<string, Member[]>();
  for (const m of members) {
    byRole.set(m.role, [...(byRole.get(m.role) ?? []), m]);
  }
  const totalCount = members.length;
  const roles = MEMBER_ROLES.filter((r) => byRole.has(r.value));

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-line px-3.5 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.07em] text-foreground">
          Team{totalCount > 0 ? ` · ${totalCount}` : ""}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] sm:py-0.5 text-muted-foreground hover:bg-muted"
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="px-3.5 py-3">
        {totalCount === 0 ? (
          <p className="text-[12px] text-muted-foreground">No one tagged to this warehouse yet.</p>
        ) : !open ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {roles.map((r) => (
              <span
                key={r.value}
                className={`rounded-pill border px-2 py-1.5 text-[11px] sm:py-0.5 ${ROLE_COLOR_CLASS[r.value]}`}
              >
                {r.label} · {byRole.get(r.value)!.length}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {roles.map((r) => (
              <div
                key={r.value}
                className={`rounded-md border px-2.5 py-1.5 ${ROLE_COLOR_CLASS[r.value]}`}
              >
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
        )}
      </div>
    </div>
  );
}
