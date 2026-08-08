"use client";

import { useState } from "react";
import { MEMBER_ROLES, roleLabel } from "@/lib/roles";

type Member = { role: string; full_name: string | null; email: string };

// Each role keeps the same color every time it's shown — a coherent,
// deterministic mapping rather than one shared per reporter/resolver bucket.
const ROLE_PILL_CLASS: Record<string, string> = {
  operations: "bg-frost text-teal-deep border-frost",
  hvac_engineer: "bg-sky text-teal-deep border-sky",
  program_manager_infra: "bg-mint text-mint-deep border-mint",
  pmc: "bg-amber text-amber-deep border-amber",
  pmo: "bg-blush text-red-deep border-blush",
  warehouse_admin: "bg-line-soft text-foreground border-line",
};

export function TeamBlock({ members }: { members: Member[] }) {
  const [expanded, setExpanded] = useState(false);

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
    <div className="rounded-card border border-border bg-card p-3">
      <div className="mb-2 text-[9px] uppercase tracking-[0.07em] text-faint">Team</div>
      {!expanded ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
            <span
              key={r.value}
              className={`rounded-pill border px-2 py-0.5 text-[11px] ${ROLE_PILL_CLASS[r.value]}`}
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
      ) : (
        <div className="flex flex-col gap-2">
          {MEMBER_ROLES.filter((r) => byRole.has(r.value)).map((r) => (
            <div key={r.value} className={`rounded-md border px-2.5 py-1.5 ${ROLE_PILL_CLASS[r.value]}`}>
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
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="self-start text-[12px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Collapse
          </button>
        </div>
      )}
    </div>
  );
}
