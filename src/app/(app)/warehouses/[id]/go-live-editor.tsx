"use client";

import { useState, useTransition } from "react";
import { updateGoLiveDate } from "./actions";

export function GoLiveEditor({
  warehouseId,
  goLiveDate,
}: {
  warehouseId: string;
  goLiveDate: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goLiveDate ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[13.5px] underline-offset-2 hover:underline"
      >
        {goLiveDate
          ? new Date(goLiveDate + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Set date"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-input bg-background px-1.5 py-0.5 text-[12px]"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateGoLiveDate(warehouseId, value);
            if (result.error) {
              setError(result.error);
              return;
            }
            setError(null);
            setEditing(false);
          })
        }
        className="text-[12px] font-medium text-primary"
      >
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-muted-foreground">
        Cancel
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
