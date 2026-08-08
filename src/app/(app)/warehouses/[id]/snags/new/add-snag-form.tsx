"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { raiseSnag } from "./actions";

function RadioCards({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`rounded-md border px-2.5 py-1.5 text-[12px] ${
            value === val
              ? "border-primary bg-accent text-accent-foreground"
              : "border-input bg-background text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function AddSnagForm({ warehouseId }: { warehouseId: string }) {
  const [state, formAction, pending] = useActionState(
    raiseSnag.bind(null, warehouseId),
    { error: null }
  );

  const [category, setCategory] = useState("hvac");
  const [subCategory, setSubCategory] = useState("odu");
  const [location, setLocation] = useState("frozen_chamber");
  const [scope, setScope] = useState("infra");
  const [severity, setSeverity] = useState("medium");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Description
        </Label>
        <textarea
          name="description"
          required
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Evaporator fan not coming back on after defrost"
        />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Category
        </Label>
        <RadioCards
          name="category"
          value={category}
          onChange={setCategory}
          options={Object.entries(CATEGORY_LABELS) as [string, string][]}
        />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Sub-category
        </Label>
        <RadioCards
          name="sub_category"
          value={subCategory}
          onChange={setSubCategory}
          options={Object.entries(SUB_CATEGORY_LABELS) as [string, string][]}
        />
        {subCategory === "others" && (
          <input
            name="sub_category_other"
            required
            placeholder="Describe the sub-category"
            className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        )}
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Location
        </Label>
        <RadioCards
          name="location"
          value={location}
          onChange={setLocation}
          options={Object.entries(LOCATION_LABELS) as [string, string][]}
        />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Scope
        </Label>
        <RadioCards
          name="scope"
          value={scope}
          onChange={setScope}
          options={Object.entries(SCOPE_LABELS) as [string, string][]}
        />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Severity
        </Label>
        <RadioCards
          name="severity"
          value={severity}
          onChange={setSeverity}
          options={Object.entries(SEVERITY_LABELS) as [string, string][]}
        />
        <p className="mt-1.5 text-[11.5px] font-medium text-red-deep">
          High means this stops the warehouse launching.
        </p>
      </div>

      {state.error && <p className="text-[12.5px] text-destructive">{state.error}</p>}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Raising…" : "Raise snag"}
        </Button>
      </div>
    </form>
  );
}
