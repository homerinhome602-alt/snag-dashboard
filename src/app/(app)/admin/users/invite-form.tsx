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
import { MEMBER_ROLES, roleLabel } from "@/lib/roles";
import { createInvitation } from "./actions";

type State = { error: string | null; success: boolean };
type Warehouse = { id: string; name: string };

export function InviteForm({ warehouses }: { warehouses: Warehouse[] }) {
  const [formKey, setFormKey] = useState(0);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => {
      const result = await createInvitation(formData);
      if (result.error) return { error: result.error, success: false };
      // Role and Admin (base-ui Select) and the Warehouse multi-select
      // manage their own state — a native form reset after the action
      // doesn't reach them, so force a full remount to clear everything
      // rather than leaving the last invite's values sitting there.
      setWarehouseIds([]);
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

        <Select name="default_role" required>
          <SelectTrigger className="w-56">
            <SelectValue>{(value: string | null) => (value ? roleLabel(value) : "Role")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <MultiSelectFilter
          label="Warehouse"
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          selected={warehouseIds}
          onChange={setWarehouseIds}
          className="w-56"
        />
        {warehouseIds.map((id) => (
          <input key={id} type="hidden" name="warehouse_ids" value={id} />
        ))}

        <Select name="grant_dashboard_admin" defaultValue="no">
          <SelectTrigger className="w-56">
            <SelectValue>{(value: string) => (value === "yes" ? "Admin: Yes" : "Admin: No")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">No</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" disabled={pending} className="w-56">
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      {state.error && <p className="mt-2 text-[12.5px] text-destructive">{state.error}</p>}
      {state.success && <p className="mt-2 text-[12.5px] text-mint-deep">Invite sent.</p>}
    </form>
  );
}
