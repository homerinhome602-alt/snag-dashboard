"use client";

import { useTransition } from "react";
import { setDashboardAdmin } from "./actions";

export function AdminToggle({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setDashboardAdmin(userId, !isAdmin);
        })
      }
      className="text-[11.5px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
    >
      {isAdmin ? "Revoke admin" : "Make admin"}
    </button>
  );
}
