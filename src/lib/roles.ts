export const MEMBER_ROLES = [
  { value: "operations", label: "Operations" },
  { value: "hvac_engineer", label: "HVAC Engineer" },
  { value: "program_manager_infra", label: "Program Manager (Infra)" },
  { value: "pmc", label: "PMC" },
  { value: "pmo", label: "PMO" },
  { value: "warehouse_admin", label: "Warehouse Admin" },
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number]["value"];

export function roleLabel(role: string | null | undefined) {
  return MEMBER_ROLES.find((r) => r.value === role)?.label ?? role ?? "—";
}

// PLAN.md §2.1: reporters raise snags, resolvers drive them to close.
// Typed as string[] (not MemberRole[]) since these are checked against
// loosely-typed values coming back from the database client.
export const REPORTER_ROLES: string[] = ["operations", "hvac_engineer"];
export const RESOLVER_ROLES: string[] = [
  "program_manager_infra",
  "pmc",
  "pmo",
  "warehouse_admin",
];
