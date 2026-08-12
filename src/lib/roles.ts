export const MEMBER_ROLES = [
  { value: "operations", label: "Operations" },
  { value: "hvac_engineer", label: "HVAC Engineer" },
  { value: "program_manager_infra", label: "Program Manager (Infra)" },
  { value: "pmc", label: "PMC" },
  { value: "pmo", label: "PMO" },
  { value: "warehouse_admin", label: "Warehouse Admin" },
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number]["value"];

// Dashboard Admin is a global flag (profiles.is_dashboard_admin), not a
// warehouse_members.role value — this sentinel exists only so the invite
// form can offer it in the same picker as the 6 operational roles. Never
// write it to a default_role/role column; createInvitation branches on it
// instead (grant_dashboard_admin: true, default_role: null).
export const DASHBOARD_ADMIN_VALUE = "dashboard_admin";

export const INVITE_ROLE_OPTIONS = [
  ...MEMBER_ROLES,
  { value: DASHBOARD_ADMIN_VALUE, label: "Dashboard Admin" },
] as const;

export function roleLabel(role: string | null | undefined) {
  return INVITE_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? "—";
}

// Single source of truth for role color-coding: each of the 6 roles keeps
// the same distinct color everywhere it's shown (team block, warehouse
// pickers, user management, etc.) — a coherent mapping, not per-screen.
export const ROLE_COLOR_CLASS: Record<string, string> = {
  operations: "bg-frost text-teal-deep border-frost",
  hvac_engineer: "bg-sky text-teal-deep border-sky",
  program_manager_infra: "bg-mint text-mint-deep border-mint",
  pmc: "bg-amber text-amber-deep border-amber",
  pmo: "bg-blush text-red-deep border-blush",
  warehouse_admin: "bg-line-soft text-foreground border-line",
};

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
