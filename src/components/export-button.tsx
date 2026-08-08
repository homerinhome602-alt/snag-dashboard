"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportSnagsToExcel } from "@/lib/excel";
import type { SnagRow } from "@/components/snag-table";

export function ExportButton({ snags, warehouseName }: { snags: SnagRow[]; warehouseName: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await exportSnagsToExcel(snags, warehouseName);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Exporting…" : "Export"}
    </Button>
  );
}
