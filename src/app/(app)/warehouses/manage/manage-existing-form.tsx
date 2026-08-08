"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RolePeoplePicker } from "@/components/role-people-picker";
import { MEMBER_ROLES, type MemberRole } from "@/lib/roles";
import { addWarehouseMembers, getWarehouseMembers, removeWarehouseMember } from "./actions";

type Person = { id: string; full_name: string | null; email: string; default_role: MemberRole | null };
type Warehouse = { id: string; name: string };

const EMPTY_SELECTIONS: Record<MemberRole, string[]> = {
  operations: [],
  hvac_engineer: [],
  program_manager_infra: [],
  pmc: [],
  pmo: [],
  warehouse_admin: [],
};

export function ManageExistingForm({ warehouses, people }: { warehouses: Warehouse[]; people: Person[] }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [existing, setExisting] = useState<Record<MemberRole, string[]>>(EMPTY_SELECTIONS);
  const [selections, setSelections] = useState<Record<MemberRole, string[]>>(EMPTY_SELECTIONS);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!warehouseId) {
      setExisting(EMPTY_SELECTIONS);
      setSelections(EMPTY_SELECTIONS);
      return;
    }
    setLoading(true);
    setSaved(false);
    getWarehouseMembers(warehouseId).then((rows) => {
      const grouped: Record<MemberRole, string[]> = {
        operations: [],
        hvac_engineer: [],
        program_manager_infra: [],
        pmc: [],
        pmo: [],
        warehouse_admin: [],
      };
      for (const row of rows) {
        if (row.role in grouped) grouped[row.role as MemberRole].push(row.user_id);
      }
      setExisting(grouped);
      setSelections(grouped);
      setLoading(false);
    });
  }, [warehouseId]);

  function setRole(role: MemberRole, next: string[]) {
    setSelections((prev) => ({ ...prev, [role]: next }));
  }

  function removeMember(role: MemberRole, userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeWarehouseMember(warehouseId, role, userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setExisting((prev) => ({ ...prev, [role]: prev[role].filter((id) => id !== userId) }));
      setSelections((prev) => ({ ...prev, [role]: prev[role].filter((id) => id !== userId) }));
    });
  }

  function submit() {
    setError(null);
    const added = Object.entries(selections).flatMap(([role, ids]) =>
      ids.filter((id) => !existing[role as MemberRole].includes(id)).map((user_id) => ({ user_id, role }))
    );

    startTransition(async () => {
      const result = await addWarehouseMembers(warehouseId, added);
      if (result.error) {
        setError(result.error);
        return;
      }
      setExisting(selections);
      setSaved(true);
    });
  }

  const hasNewMembers = Object.entries(selections).some(
    ([role, ids]) => ids.some((id) => !existing[role as MemberRole].includes(id))
  );

  return (
    <div>
      <div className="mb-4">
        <label className="mb-1.5 block text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Warehouse
        </label>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px]"
        >
          <option value="">Select a warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {warehouseId && loading && (
        <p className="text-[12.5px] text-muted-foreground">Loading current team…</p>
      )}

      {warehouseId && !loading && (
        <>
          <p className="mb-3 text-[12px] text-muted-foreground">
            Existing members show a × to remove them from a role, or add new people below.
          </p>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2">
            {MEMBER_ROLES.map((r) => (
              <RolePeoplePicker
                key={r.value}
                role={r.value}
                label={r.label}
                people={people}
                selected={selections[r.value]}
                onChange={(next) => setRole(r.value, next)}
                lockedIds={existing[r.value]}
                onRemoveLocked={(id) => removeMember(r.value, id)}
              />
            ))}
          </div>

          {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
          {saved && !hasNewMembers && (
            <p className="mt-3 text-[12.5px] text-mint-deep">Saved.</p>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={pending || !hasNewMembers} onClick={submit}>
              {pending ? "Saving…" : "Add to warehouse"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
