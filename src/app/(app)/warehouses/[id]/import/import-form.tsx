"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { downloadImportTemplate, parseImportFile, type ImportRow, type ImportRowError } from "@/lib/excel";
import { raiseSnag } from "../snags/new/actions";

type Phase = "idle" | "parsed" | "importing" | "done";

export function ImportForm({ warehouseId }: { warehouseId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<{ succeeded: number; failed: ImportRowError[] }>({
    succeeded: 0,
    failed: [],
  });

  async function onFileSelected(file: File) {
    setFileName(file.name);
    const { rows: parsedRows, errors: parseErrors } = await parseImportFile(file);
    setRows(parsedRows);
    setErrors(parseErrors);
    setPhase("parsed");
  }

  async function commitImport() {
    setPhase("importing");
    let succeeded = 0;
    const failed: ImportRowError[] = [];

    // Row by row through the same RPC-gated path as a manual raise — no
    // bulk-insert shortcut around the reporter check or activity log.
    for (const row of rows) {
      const result = await raiseSnag(warehouseId, {
        description: row.description,
        category: row.category,
        subCategory: row.subCategory,
        subCategoryOther: row.subCategoryOther,
        location: row.location,
        scope: row.scope,
        severity: row.severity,
      });
      if (result.error) {
        failed.push({ rowNumber: row.rowNumber, message: result.error });
      } else {
        succeeded++;
      }
    }

    setResults({ succeeded, failed });
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <div>
        <div className="rounded-md border border-mint bg-mint p-3 text-[13px] text-mint-deep">
          {results.succeeded} snag{results.succeeded === 1 ? "" : "s"} imported.
        </div>
        {results.failed.length > 0 && (
          <div className="mt-3 rounded-md border border-blush bg-blush p-3">
            <p className="text-[12.5px] font-medium text-red-deep">
              {results.failed.length} row{results.failed.length === 1 ? "" : "s"} failed:
            </p>
            <ul className="mt-1 list-disc pl-4">
              {results.failed.map((f) => (
                <li key={f.rowNumber} className="text-[12px] text-red-deep">
                  Row {f.rowNumber}: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button type="button" className="mt-4" onClick={() => router.push(`/warehouses/${warehouseId}`)}>
          Back to warehouse
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[12.5px] text-muted-foreground">
          Download the template, fill in one row per snag, then upload it below.
        </p>
        <Button type="button" variant="outline" onClick={() => downloadImportTemplate()}>
          Download template
        </Button>
      </div>

      <div>
        <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-[12.5px] text-muted-foreground hover:bg-muted">
          {fileName ?? "Upload filled-in template (.xlsx)"}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
        </label>
      </div>

      {phase === "parsed" && (
        <div>
          {errors.length > 0 ? (
            <div className="rounded-md border border-blush bg-blush p-3">
              <p className="text-[12.5px] font-medium text-red-deep">
                {errors.length} row{errors.length === 1 ? "" : "s"} need fixing before anything is imported:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {errors.map((e, i) => (
                  <li key={i} className="text-[12px] text-red-deep">
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-mint bg-mint p-3 text-[12.5px] text-mint-deep">
              {rows.length} row{rows.length === 1 ? "" : "s"} validated and ready to import.
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-line-soft pt-3.5">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={phase !== "parsed" || errors.length > 0 || rows.length === 0}
          onClick={commitImport}
        >
          {phase === "importing" ? "Importing…" : `Import ${rows.length || ""} snag${rows.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
