import { MEMBER_ROLES, REPORTER_ROLES, ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <h1 className="mb-2 text-[17px] font-medium tracking-[-0.015em] text-foreground">About this dashboard</h1>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Frozen Warehouse Launch Readiness tracks defects — snags — found while a cold-storage warehouse is being
        built and commissioned, so nothing blocks opening day by surprise. Everyone tagged to a warehouse can see
        what&apos;s still open there.
      </p>
      <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
        There is no split between who raises issues and who fixes them — <strong className="font-medium text-foreground">anyone
        tagged to a warehouse can do every task on a snag</strong>. Roles are organisational labels only; they
        decide which side of the conversation a person&apos;s messages sit on, nothing more.
      </p>

      <div className="rounded-card border border-border bg-card p-4">
        <div className="mb-1 text-[14px] font-medium text-foreground">On a snag, anyone tagged can</div>
        <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
          <li>Raise a new snag — description, category, sub-category, location, scope, severity, and photos or video.</li>
          <li>Comment on the thread, with photos or video.</li>
          <li>Set an ETC for when the fix will land.</li>
          <li>Move a snag to WIP, or mark it ready to close for someone to verify.</li>
          <li>Close a ticket directly, or confirm / reject a closure that&apos;s awaiting verification.</li>
          <li>Reopen a closed snag — it goes back to WIP.</li>
          <li>Set or change the warehouse&apos;s go-live date.</li>
        </ul>
      </div>

      <div className="mt-3 rounded-card border border-border bg-card p-4">
        <div className="mb-1 text-[14px] font-medium text-foreground">Everyone tagged to a warehouse</div>
        <p className="mb-3 text-[12px] text-muted-foreground">
          Two things on each warehouse page are shared — anyone tagged there can fill them in.
        </p>
        <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
          <li>
            <span className="font-medium">Handover documents</span> — upload, replace, or remove the
            commissioning document set. Each item ticks off automatically once a file is attached;
            anyone with access can download it, and a per-document history records who changed what
            and when.
          </li>
          <li>
            <span className="font-medium">Machine and Controller Details</span> — record each
            chamber&apos;s name, number of machines, capacity (kW), and ODU / IDU / controller models.
          </li>
        </ul>
      </div>

      <div className="mt-3 rounded-card border border-border bg-card p-4">
        <div className="mb-1 text-[14px] font-medium text-foreground">The roles people hold</div>
        <p className="mb-3 text-[12px] text-muted-foreground">
          A person holds one role, the same on every warehouse they&apos;re tagged to. It doesn&apos;t change
          what they can do — it sets their default side in the chat feed (the first group below sits on
          the left, the second on the right) and their badge colour.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MEMBER_ROLES.map((r) => (
            <span
              key={r.value}
              className={`rounded-pill border px-2 py-1.5 text-[11px] sm:py-0.5 ${ROLE_COLOR_CLASS[r.value]} ${
                REPORTER_ROLES.includes(r.value) ? "" : "order-last"
              }`}
            >
              {roleLabel(r.value)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
