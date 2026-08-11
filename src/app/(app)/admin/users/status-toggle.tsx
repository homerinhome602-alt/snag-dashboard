"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setUserActive } from "./actions";

export function StatusToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setUserActive(userId, !isActive);
        })
      }
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
