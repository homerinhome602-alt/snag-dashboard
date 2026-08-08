"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEMBER_ROLES, roleLabel } from "@/lib/roles";
import { createInvitation } from "./actions";

type State = { error: string | null };

export function InviteForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => createInvitation(formData),
    { error: null }
  );

  return (
    <form action={formAction} className="mb-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
        <Input name="email" type="email" placeholder="name@company.com" required />
        <Select name="default_role" defaultValue="hvac_engineer">
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string) => roleLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <input type="checkbox" name="grant_dashboard_admin" className="accent-primary" />
        Also make this person a Dashboard Admin
      </label>
      {state.error && <p className="mt-2 text-[12.5px] text-destructive">{state.error}</p>}
    </form>
  );
}
