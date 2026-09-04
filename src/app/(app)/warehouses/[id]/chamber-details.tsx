"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addChamber, updateChamber, deleteChamber, type ChamberInput } from "./asset-actions";

export type ChamberRow = {
  id: string;
  chamber_name: string;
  machine_count: number | null;
  machine_capacity_kw: number | null;
  odu_model: string | null;
  idu_model: string | null;
  controller_model: string | null;
  updatedByName: string | null;
};

const EMPTY: ChamberInput = {
  chamber_name: "",
  machine_count: null,
  machine_capacity_kw: null,
  odu_model: null,
  idu_model: null,
  controller_model: null,
};

// Last column is a fixed width (not `auto`) so the header row — whose last
// cell is empty — keeps the same column widths as the data/edit rows, whose
// last cell holds the action buttons. With `auto` the header's fr columns
// stretched wider, pushing the rightmost heading past its column.
const COLS =
  "grid grid-cols-1 gap-2 sm:grid-cols-[1.5fr_0.8fr_0.9fr_1fr_1fr_1fr_7rem] sm:items-center";

type FieldKey = keyof ChamberInput;
const FIELDS: { key: FieldKey; label: string; numeric?: boolean; step?: string }[] = [
  { key: "chamber_name", label: "Chamber name" },
  { key: "machine_count", label: "No. of machines", numeric: true },
  { key: "machine_capacity_kw", label: "Capacity (kW)", numeric: true, step: "0.1" },
  { key: "odu_model", label: "ODU model" },
  { key: "idu_model", label: "IDU model" },
  { key: "controller_model", label: "Controller model" },
];
const HEAD = FIELDS.map((f) => f.label);

// The horizontal header row only exists at sm+; on a stacked mobile layout
// each cell carries its own small label instead.
const CellLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-0.5 block text-[9px] uppercase tracking-[0.07em] text-faint sm:hidden">
    {children}
  </span>
);

function Fields({
  values,
  onChange,
}: {
  values: ChamberInput;
  onChange: (v: ChamberInput) => void;
}) {
  return (
    <>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <CellLabel>{f.label}</CellLabel>
          <Input
            type={f.numeric ? "number" : "text"}
            min={f.numeric ? 0 : undefined}
            step={f.step}
            value={(values[f.key] ?? "") as string | number}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...values,
                [f.key]: f.numeric ? (raw === "" ? null : Number(raw)) : raw,
              });
            }}
            placeholder={f.key === "chamber_name" ? "Chamber Name" : "—"}
            className="h-8 text-center text-[12.5px]"
          />
        </div>
      ))}
    </>
  );
}

export function ChamberDetails({
  warehouseId,
  canEdit,
  chambers,
}: {
  warehouseId: string;
  canEdit: boolean;
  chambers: ChamberRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChamberInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<ChamberInput>(EMPTY);

  function saveNew() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const r = await addChamber(warehouseId, draft);
      if (r.error) return setError(r.error);
      setDraft(null);
      router.refresh();
    });
  }

  function beginEdit(c: ChamberRow) {
    setEditId(c.id);
    setEditValues({
      chamber_name: c.chamber_name,
      machine_count: c.machine_count,
      machine_capacity_kw: c.machine_capacity_kw,
      odu_model: c.odu_model,
      idu_model: c.idu_model,
      controller_model: c.controller_model,
    });
  }

  function saveEdit() {
    if (!editId) return;
    setError(null);
    startTransition(async () => {
      const r = await updateChamber(warehouseId, editId, editValues);
      if (r.error) return setError(r.error);
      setEditId(null);
      router.refresh();
    });
  }

  function remove(c: ChamberRow) {
    setError(null);
    startTransition(async () => {
      const r = await deleteChamber(warehouseId, c.id);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-line px-3.5 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.07em] text-foreground">
          Machine and Controller Details
        </div>
        {canEdit && (
          <button
            type="button"
            aria-label="Add chamber"
            onClick={() => setDraft(draft ? draft : { ...EMPTY })}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] sm:py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="text-[14px] leading-none">+</span> Add Chamber
          </button>
        )}
      </div>

      <div className="px-3.5 py-3">
      <p className="mb-3 text-[11.5px] text-muted-foreground">
        Anyone tagged to this warehouse can add, edit, or remove chambers.
      </p>

      {error && <p className="mb-2 text-[12px] text-destructive">{error}</p>}

      {chambers.length === 0 && !draft && (
        <p className="text-[12px] text-muted-foreground">
          No chambers recorded yet.{canEdit ? " Use the + to add the first one." : ""}
        </p>
      )}

      {(chambers.length > 0 || draft) && (
        <div className="flex flex-col gap-1.5">
          <div className={`${COLS} hidden px-1 sm:grid`}>
            {HEAD.map((h) => (
              <div key={h} className="text-center text-[9px] uppercase tracking-[0.07em] text-faint">
                {h}
              </div>
            ))}
            <div />
          </div>

          {chambers.map((c) =>
            editId === c.id ? (
              <div key={c.id} className={`${COLS} rounded-md bg-muted/40 p-1`}>
                <Fields values={editValues} onChange={setEditValues} />
                <div className="flex gap-1">
                  <Button size="sm" onClick={saveEdit} disabled={pending}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)} disabled={pending}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={c.id}
                className={`${COLS} border-t border-border px-1 py-1.5 text-center text-[12.5px]`}
              >
                <div className="font-medium text-foreground">
                  <CellLabel>Chamber name</CellLabel>
                  {c.chamber_name}
                </div>
                <div className="font-mono text-faint sm:text-foreground">
                  <CellLabel>No. of machines</CellLabel>
                  {c.machine_count ?? "—"}
                </div>
                <div className="font-mono text-faint sm:text-foreground">
                  <CellLabel>Capacity (kW)</CellLabel>
                  {c.machine_capacity_kw ?? "—"}
                </div>
                <div className="text-muted-foreground">
                  <CellLabel>ODU model</CellLabel>
                  {c.odu_model ?? "—"}
                </div>
                <div className="text-muted-foreground">
                  <CellLabel>IDU model</CellLabel>
                  {c.idu_model ?? "—"}
                </div>
                <div className="text-muted-foreground">
                  <CellLabel>Controller model</CellLabel>
                  {c.controller_model ?? "—"}
                </div>
                {canEdit ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(c)} disabled={pending}>
                      Edit
                    </Button>
                    <button
                      type="button"
                      aria-label={`Delete ${c.chamber_name}`}
                      title="Delete chamber"
                      onClick={() => remove(c)}
                      disabled={pending}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-[15px] leading-none text-muted-foreground hover:bg-muted hover:text-red-deep disabled:opacity-40 sm:h-6 sm:w-6"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div />
                )}
              </div>
            )
          )}

          {draft && (
            <div className={`${COLS} rounded-md bg-muted/40 p-1`}>
              <Fields values={draft} onChange={setDraft} />
              <div className="flex gap-1">
                <Button size="sm" onClick={saveNew} disabled={pending || !draft.chamber_name.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
