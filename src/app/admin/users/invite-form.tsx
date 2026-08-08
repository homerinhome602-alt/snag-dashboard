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
import { MEMBER_ROLES } from "@/lib/roles";
import { createInvitation } from "./actions";

type State = { error: string | null };

export function InviteForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => createInvitation(formData),
    { error: null }
  );

  return (
    <form action={formAction} className="mb-4">
      <div className="grid grid-cols-[1fr_180px_auto] gap-2">
        <Input name="email" type="email" placeholder="name@company.com" required />
        <Select name="default_role" defaultValue="hvac_engineer">
          <SelectTrigger className="w-full">
            <SelectValue />
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
      {state.error && <p className="mt-2 text-[12.5px] text-destructive">{state.error}</p>}
    </form>
  );
}
