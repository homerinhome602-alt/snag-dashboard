"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhotoCaptureInput } from "@/components/photo-capture";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type PhotoCapture } from "@/lib/media";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { raiseSnag } from "./actions";

function RadioCards({
  options,
  value,
  onChange,
}: {
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
    </div>
  );
}

export function AddSnagForm({ warehouseId, currentUserId }: { warehouseId: string; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("hvac");
  const [subCategory, setSubCategory] = useState("odu");
  const [subCategoryOther, setSubCategoryOther] = useState("");
  const [location, setLocation] = useState("frozen_chamber");
  const [scope, setScope] = useState("infra");
  const [severity, setSeverity] = useState("medium");
  const [photo, setPhoto] = useState<PhotoCapture | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await raiseSnag(warehouseId, {
        description: description.trim(),
        category,
        subCategory,
        subCategoryOther: subCategory === "others" ? subCategoryOther.trim() : null,
        location,
        scope,
        severity,
      });

      if (result.error || !result.snagId) {
        setError(result.error ?? "Could not raise the snag.");
        return;
      }

      if (photo) {
        const supabase = createClient();
        const uploadResult = await uploadAttachment(supabase, {
          warehouseId,
          snagId: result.snagId,
          mediaType: "image",
          file: photo.annotated,
          original: photo.original,
          thumbnail: photo.thumbnail,
          fileName: "snag-photo.jpg",
          uploaderId: currentUserId,
        });
        if (uploadResult.error) {
          setError(`Snag raised, but the photo failed to upload: ${uploadResult.error}`);
          return;
        }
      }

      router.push(`/warehouses/${warehouseId}?raised=${result.serialNo}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Description
        </Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Evaporator fan not coming back on after defrost"
        />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Photo (optional)
        </Label>
        <PhotoCaptureInput onChange={setPhoto} />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Category
        </Label>
        <RadioCards value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABELS) as [string, string][]} />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Sub-category
        </Label>
        <RadioCards
          value={subCategory}
          onChange={setSubCategory}
          options={Object.entries(SUB_CATEGORY_LABELS) as [string, string][]}
        />
        {subCategory === "others" && (
          <input
            value={subCategoryOther}
            onChange={(e) => setSubCategoryOther(e.target.value)}
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
        <RadioCards value={location} onChange={setLocation} options={Object.entries(LOCATION_LABELS) as [string, string][]} />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Scope
        </Label>
        <RadioCards value={scope} onChange={setScope} options={Object.entries(SCOPE_LABELS) as [string, string][]} />
      </div>

      <div>
        <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          Severity
        </Label>
        <RadioCards value={severity} onChange={setSeverity} options={Object.entries(SEVERITY_LABELS) as [string, string][]} />
        <p className="mt-1.5 text-[11.5px] font-medium text-red-deep">
          High means this stops the warehouse launching.
        </p>
      </div>

      {error && <p className="text-[12.5px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button type="button" disabled={pending || !description.trim()} onClick={submit}>
          {pending ? "Raising…" : "Raise snag"}
        </Button>
      </div>
    </div>
  );
}
