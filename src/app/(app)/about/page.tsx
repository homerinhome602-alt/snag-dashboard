import { ROLE_COLOR_CLASS, roleLabel } from "@/lib/roles";

const REPORTER_ROLE_VALUES = ["hvac_engineer", "operations", "warehouse_admin"];
const RESOLVER_ROLE_VALUES = ["program_manager_infra", "pmc", "pmo"];

function RoleChips({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className={`rounded-pill border px-2 py-0.5 text-[11px] ${ROLE_COLOR_CLASS[v]}`}>
          {roleLabel(v)}
        </span>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 lg:px-[50px]">
      <h1 className="mb-2 text-[17px] font-medium tracking-[-0.015em] text-foreground">About this dashboard</h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
        Frozen Warehouse Launch Readiness tracks defects — snags — found while a cold-storage warehouse is being
        built and commissioned, so nothing blocks opening day by surprise. Everyone can see what&apos;s still open
        across a warehouse; the two roles below are the people who raise issues and the people who close them.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="mb-1 text-[14px] font-medium text-foreground">Reporters</div>
          <p className="mb-3 text-[12px] text-muted-foreground">Raise what they find on the floor.</p>
          <div className="mb-3">
            <RoleChips values={REPORTER_ROLE_VALUES} />
          </div>
          <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
            <li>
              Raise a new snag — description, category, sub-category, location, scope, severity, and photos.
            </li>
            <li>Comment on any snag raised on a warehouse they&apos;re tagged to.</li>
            <li>Close a ticket directly at any time.</li>
            <li>Confirm or reject a snag once a resolver has marked it ready to close.</li>
          </ul>
        </div>

        <div className="rounded-card border border-border bg-card p-4">
          <div className="mb-1 text-[14px] font-medium text-foreground">Resolvers</div>
          <p className="mb-3 text-[12px] text-muted-foreground">Drive each snag to close.</p>
          <div className="mb-3">
            <RoleChips values={RESOLVER_ROLE_VALUES} />
          </div>
          <ul className="flex flex-col gap-2 text-[12.5px] text-foreground">
            <li>Comment on a snag, with photos or video.</li>
            <li>Set an ETC for when the fix will be done.</li>
            <li>Move a snag to WIP, or mark it ready to close for the reporter to verify.</li>
            <li>Set a warehouse&apos;s go-live date.</li>
          </ul>
        </div>
      </div>

      <p className="mt-6 text-[11.5px] text-faint">
        A person&apos;s role applies everywhere they&apos;re tagged to a warehouse — the same person can raise snags
        on one warehouse and resolve them on another.
      </p>
    </div>
  );
}
