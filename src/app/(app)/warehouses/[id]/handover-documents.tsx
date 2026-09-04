"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeHandoverDocument, uploadHandoverDocument } from "./asset-actions";

export type HandoverDocRow = {
  docTypeId: string;
  name: string;
  fileName: string | null;
  downloadUrl: string | null;
};

export type HandoverHistoryEntry = {
  id: string;
  action: string;
  docName: string | null;
  fileName: string | null;
  at: string;
  by: string;
};

const ACTION_VERB: Record<string, string> = {
  upload: "added",
  replace: "replaced",
  remove: "removed",
  check: "marked complete",
  uncheck: "unmarked",
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

function HistoryModal({
  title,
  entries,
  onClose,
}: {
  title: string;
  entries: HandoverHistoryEntry[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-foreground">History</h2>
            <p className="truncate text-[11px] text-faint" title={title}>
              {title}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-md px-1.5 text-[15px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {entries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing has been added or removed for this document yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id} className="text-[12px] leading-snug">
                  <span className="font-mono text-[10.5px] text-faint">{fmtDateTime(e.at)}</span>
                  <div className="text-foreground">
                    <span className="font-medium">{e.by}</span> {ACTION_VERB[e.action] ?? e.action}
                    {e.fileName && (e.action === "upload" || e.action === "replace") ? (
                      <span className="text-faint"> · {e.fileName}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function HandoverDocuments({
  warehouseId,
  canEdit,
  rows,
  history,
}: {
  warehouseId: string;
  canEdit: boolean;
  rows: HandoverDocRow[];
  history: HandoverHistoryEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [historyDoc, setHistoryDoc] = useState<HandoverDocRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const uploaded = rows.filter((r) => r.downloadUrl).length;
  const historyByDoc = new Map<string, HandoverHistoryEntry[]>();
  for (const h of history) {
    if (!h.docName) continue;
    const list = historyByDoc.get(h.docName) ?? [];
    list.push(h);
    historyByDoc.set(h.docName, list);
  }

  async function upload(row: HandoverDocRow, file: File) {
    setError(null);
    setBusyId(row.docTypeId);
    const fd = new FormData();
    fd.set("warehouseId", warehouseId);
    fd.set("docTypeId", row.docTypeId);
    fd.set("file", file);
    const r = await uploadHandoverDocument(fd);
    if (r.error) setError(r.error);
    setBusyId(null);
    router.refresh();
  }

  function remove(row: HandoverDocRow) {
    setError(null);
    setBusyId(row.docTypeId);
    startTransition(async () => {
      const r = await removeHandoverDocument(warehouseId, row.docTypeId);
      if (r.error) setError(r.error);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-line px-3.5 py-2">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.07em] text-foreground">
            Handover documents
          </div>
          <div className="text-[10.5px] text-muted-foreground">
            {uploaded} of {rows.length} uploaded
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] sm:py-0.5 text-muted-foreground hover:bg-muted"
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="px-3.5 py-3">
        <p className="text-[11.5px] text-muted-foreground">
          Anyone tagged to this warehouse can upload, replace, or remove a file — the tick fills in
          automatically once a file is attached. Everyone with access can download.
        </p>
        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

        {open && (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {rows.map((row) => {
              const busy = busyId === row.docTypeId;
              const hasFile = !!row.downloadUrl;
              return (
                <li key={row.docTypeId} className="flex items-center gap-2.5 py-1.5">
                  <span
                    role="img"
                    aria-label={hasFile ? `${row.name} — uploaded` : `${row.name} — not uploaded`}
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border " +
                      (hasFile
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/50 bg-transparent")
                    }
                  >
                    {hasFile && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path
                          d="M2.5 6.5l2.5 2.5 4.5-5"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[12px] text-foreground"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  {hasFile && (
                    <a
                      href={row.downloadUrl!}
                      download
                      className="shrink-0 text-[11px] text-coral hover:underline"
                    >
                      Download
                    </a>
                  )}
                  {(historyByDoc.get(row.name)?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistoryDoc(row)}
                      className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      History
                    </button>
                  )}

                  {canEdit && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <input
                        ref={(el) => {
                          fileInputs.current[row.docTypeId] = el;
                        }}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload(row, f);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileInputs.current[row.docTypeId]?.click()}
                        className="rounded-md border border-border px-2 py-1.5 text-[11px] sm:py-0.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                      >
                        {busy ? "…" : hasFile ? "Replace" : "Upload"}
                      </button>
                      {hasFile && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove(row)}
                          aria-label="Remove file"
                          title="Remove file"
                          className="flex h-9 w-9 items-center justify-center rounded-md text-[15px] leading-none text-muted-foreground hover:bg-muted hover:text-red-deep disabled:opacity-40 sm:h-6 sm:w-6"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {historyDoc && (
        <HistoryModal
          title={historyDoc.name}
          entries={historyByDoc.get(historyDoc.name) ?? []}
          onClose={() => setHistoryDoc(null)}
        />
      )}
    </div>
  );
}
