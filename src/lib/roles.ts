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
