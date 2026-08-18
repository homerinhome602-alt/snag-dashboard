export type GoLiveChange = {
  id: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function describeChange(c: GoLiveChange) {
  const to = c.new_value ? fmtDate(c.new_value) : "not set";
  return c.old_value ? `Changed from ${fmtDate(c.old_value)} to ${to}` : `Set to ${to}`;
}

// Hover-only, CSS-driven (group/group-hover) rather than JS state — the
// tooltip has no interactivity of its own, just a static list, so it
// doesn't need to be a client component.
export function GoLiveHistoryInfo({ changes }: { changes: GoLiveChange[] }) {
  return (
    <span className="group relative inline-flex cursor-help items-center" aria-label="Go-live date change history">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-faint group-hover:text-foreground">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7.25v4M8 5.25v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <div
        className="pointer-events-none invisible absolute right-0 top-full z-30 mt-1.5 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] rounded-md bg-foreground px-2.5 py-2 text-[11px] leading-relaxed text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:visible group-hover:opacity-100"
      >
        <div className="mb-1 font-medium">Go-live date history</div>
        {changes.length === 0 ? (
          <p className="text-background/70">No changes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {changes.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-background/80">{fmtDateTime(c.created_at)}</span>
                {" · "}
                {c.actor?.full_name ?? c.actor?.email ?? "Someone"} — {describeChange(c)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </span>
  );
}
