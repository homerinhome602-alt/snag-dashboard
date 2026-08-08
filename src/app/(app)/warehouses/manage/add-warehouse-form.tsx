"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RolePeoplePicker } from "@/components/role-people-picker";
import { MEMBER_ROLES, type MemberRole } from "@/lib/roles";
import { createWarehouse } from "./actions";

type Person = {
  id: string;
  full_name: string | null;
  email: string;
  default_role: MemberRole | null;
};

export function AddWarehouseForm({ people, currentUserId }: { people: Person[]; currentUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selections, setSelections] = useState<Record<MemberRole, string[]>>({
    operations: [],
    hvac_engineer: [],
    program_manager_infra: [],
    pmc: [],
    pmo: [],
    warehouse_admin: [],
  });
  const [addMeRole, setAddMeRole] = useState<MemberRole>("warehouse_admin");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setRole(role: MemberRole, next: string[]) {
    setSelections((prev) => ({ ...prev, [role]: next }));
  }

  function addMe() {
    setSelections((prev) => ({
      ...prev,
      [addMeRole]: prev[addMeRole].includes(currentUserId)
        ? prev[addMeRole]
        : [...prev[addMeRole], currentUserId],
    }));
  }

  function submit() {
    setError(null);
    const members = Object.entries(selections).flatMap(([role, ids]) =>
      ids.map((user_id) => ({ user_id, role }))
    );

    startTransition(async () => {
      const result = await createWarehouse(name, members);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/warehouses/${result.id}`);
    });
  }

  return (
    <div>
      <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
        Warehouse name
      </Label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Warehouse name"
        className="mb-4"
      />

      <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2">
        {MEMBER_ROLES.map((r) => (
          <RolePeoplePicker
            key={r.value}
            role={r.value}
            label={r.label}
            people={people}
            selected={selections[r.value]}
            onChange={(next) => setRole(r.value, next)}
          />
        ))}
      </div>

      <div className="mt-3.5 flex flex-col items-start gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Being an admin doesn&apos;t let you raise snags or post updates here. Tag yourself in a
          role to take part.
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={addMeRole}
            onChange={(e) => setAddMeRole(e.target.value as MemberRole)}
            className="rounded-md border border-input bg-background px-1.5 py-1 text-[11.5px]"
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={addMe}>
            Add me
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/")}>
          Cancel
        </Button>
        <Button type="button" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "Creating…" : "Create warehouse"}
        </Button>
      </div>
    </div>
  );
}
