"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiPhotoCaptureInput } from "@/components/photo-capture";
import { DuplicateCheckModal } from "@/components/duplicate-check-modal";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment, type PhotoCapture } from "@/lib/media";
import { enqueueSnag } from "@/lib/offline-queue";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  SUB_CATEGORY_LABELS,
} from "@/lib/snags";
import { findSimilarSnags, raiseSnag, type DuplicateCandidate } from "./actions";

// Minimum 56px tap targets throughout — this form is used with gloved
// hands at -25°C (PLAN.md §5.7).
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
          className={`min-h-14 rounded-md border px-3.5 py-3 text-[13px] ${
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

export function AddSnagForm({
  warehouseId,
  warehouseName,
  currentUserId,
}: {
  warehouseId: string;
  warehouseName: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [subCategoryOther, setSubCategoryOther] = useState("");
  const [location, setLocation] = useState("");
  const [scope, setScope] = useState("");
  const [severity, setSeverity] = useState("");
  const [photos, setPhotos] = useState<PhotoCapture[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  const isComplete = Boolean(
    description.trim() &&
      category &&
      subCategory &&
      (subCategory !== "others" || subCategoryOther.trim()) &&
      location &&
      scope &&
      severity
  );

  async function doRaise(suppressedDuplicateIds: string[]) {
    const subCategoryOtherValue = subCategory === "others" ? subCategoryOther.trim() : null;

    const result = await raiseSnag(
      warehouseId,
      {
        description: description.trim(),
        category,
        subCategory,
        subCategoryOther: subCategoryOtherValue,
        location,
        scope,
        severity,
      },
      suppressedDuplicateIds
    );

    if (result.error || !result.snagId) {
      setError(result.error ?? "Could not raise the snag.");
      return;
    }

    if (photos.length > 0) {
      const supabase = createClient();
      for (let i = 0; i < photos.length; i++) {
        const uploadResult = await uploadAttachment(supabase, {
          warehouseId,
          snagId: result.snagId,
          mediaType: "image",
          file: photos[i].annotated,
          original: photos[i].original,
          thumbnail: photos[i].thumbnail,
          fileName: `snag-photo-${i + 1}.jpg`,
          uploaderId: currentUserId,
        });
        if (uploadResult.error) {
          setError(`Snag raised, but a photo failed to upload: ${uploadResult.error}`);
          return;
        }
      }
    }

    router.push(`/warehouses/${warehouseId}?raised=${result.serialNo}`);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const subCategoryOtherValue = subCategory === "others" ? subCategoryOther.trim() : null;

      // Offline-capable: queue locally and sync when connection returns
      // rather than letting the request hang or fail (PLAN.md §5.7). No
      // duplicate check while offline — that needs a network round trip.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueSnag({
          localId: crypto.randomUUID(),
          warehouseId,
          warehouseName,
          description: description.trim(),
          category,
          subCategory,
          subCategoryOther: subCategoryOtherValue,
          location,
          scope,
          severity,
          photos: photos.map((p) => ({ annotated: p.annotated, original: p.original, thumbnail: p.thumbnail })),
          createdAt: Date.now(),
        });
        setQueued(true);
        return;
      }

      const candidates = await findSimilarSnags(warehouseId, location, subCategory, description.trim());
      if (candidates.length > 0) {
        setDuplicates(candidates);
        return;
      }

      await doRaise([]);
    });
  }

  if (queued) {
    return (
      <div className="rounded-md border border-amber bg-amber p-4 text-center">
        <p className="text-[13px] font-medium text-amber-deep">Queued — pending sync</p>
        <p className="mt-1 text-[12px] text-amber-deep">
          No connection right now. This snag is saved on your device and will be raised
          automatically once you&apos;re back online.
        </p>
        <Button type="button" size="sm" className="mt-3" onClick={() => router.push(`/warehouses/${warehouseId}`)}>
          Back to warehouse
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Description
          </Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
            className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Add description"
          />
        </div>

        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Photos (optional)
          </Label>
          <MultiPhotoCaptureInput onChange={setPhotos} />
        </div>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
            Category
          </Label>
          <RadioCards value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABELS) as [string, string][]} />
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
      </div>

      {error && <p className="text-[12.5px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" className="min-h-14" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button type="button" className="min-h-14" disabled={pending || !isComplete} onClick={submit}>
          {pending ? "Raising…" : "Raise snag"}
        </Button>
      </div>

      {duplicates && (
        <DuplicateCheckModal
          candidates={duplicates}
          pending={pending}
          onCancel={() => setDuplicates(null)}
          onRaiseAnyway={() => {
            startTransition(async () => {
              await doRaise(duplicates.map((d) => d.id));
            });
          }}
        />
      )}
    </div>
  );
}
