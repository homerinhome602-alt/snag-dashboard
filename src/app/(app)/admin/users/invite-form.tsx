"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { INVITE_ROLE_OPTIONS, DASHBOARD_ADMIN_VALUE, roleLabel } from "@/lib/roles";
import { createInvitation } from "./actions";

type State = { error: string | null; success: boolean };
type Warehouse = { id: string; name: string };

// Not a real warehouse_id — picking it is shorthand for "every warehouse in
// the list right now" and gets expanded to the real ids client-side before
// anything is stored, so it never reaches the server as a literal value.
const ALL_WAREHOUSES_VALUE = "__all_warehouses__";

export function InviteForm({ warehouses }: { warehouses: Warehouse[] }) {
  const [formKey, setFormKey] = useState(0);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const isAdminPick = role === DASHBOARD_ADMIN_VALUE;
  // Picking "All" selects every warehouse in one go; use "Clear" in the
  // dropdown (shown once anything's selected) to go back to none. Not
  // tracked as its own checked state — it's a one-way shortcut, not a
  // fifth warehouse — so the button's "(N)" count always reflects real
  // warehouses only.
  function handleWarehouseChange(next: string[]) {
    setWarehouseIds(next.includes(ALL_WAREHOUSES_VALUE) ? warehouses.map((w) => w.id) : next);
  }

  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => {
      const result = await createInvitation(formData);
      if (result.error) return { error: result.error, success: false };
      // Role (base-ui Select) and the Warehouse multi-select manage their
      // own state — a native form reset after the action doesn't reach
      // them, so force a full remount to clear everything rather than
      // leaving the last invite's values sitting there.
      setWarehouseIds([]);
      setRole(null);
      setFormKey((k) => k + 1);
      return { error: null, success: true };
    },
    { error: null, success: false }
  );

  return (
    <form key={formKey} action={formAction} className="mb-5">
      <h2 className="mb-2 text-[14px] font-medium text-foreground">Invite people</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="email" type="email" placeholder="name@company.com" required className="w-60" />

        <Select name="role" required onValueChange={(v) => setRole(v as string)}>
          <SelectTrigger className="w-56">
            <SelectValue>
              {(value: string | null) => (value ? roleLabel(value) : "Role")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INVITE_ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isAdminPick && (
          <>
            <MultiSelectFilter
              label="Warehouse"
              emptySuffix=""
              options={[
                { value: ALL_WAREHOUSES_VALUE, label: "All" },
                ...warehouses.map((w) => ({ value: w.id, label: w.name })),
              ]}
              selected={warehouseIds}
              onChange={handleWarehouseChange}
              className="w-56"
            />
            {warehouseIds.map((id) => (
              <input key={id} type="hidden" name="warehouse_ids" value={id} />
            ))}
          </>
        )}

        <Button type="submit" disabled={pending} className="w-56">
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      {state.error && <p className="mt-2 text-[12.5px] text-destructive">{state.error}</p>}
      {state.success && <p className="mt-2 text-[12.5px] text-mint-deep">Invite sent.</p>}
    </form>
  );
}
