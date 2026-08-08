import ExcelJS from "exceljs";
import {
  CATEGORY_LABELS,
  LOCATION_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  SUB_CATEGORY_LABELS,
  ageingDays,
  isOverdue,
} from "@/lib/snags";
import type { SnagRow } from "@/components/snag-table";

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function reverseLookup(labels: Record<string, string>, input: string): string | null {
  const needle = input.trim().toLowerCase();
  const entry = Object.entries(labels).find(([, label]) => label.toLowerCase() === needle);
  return entry ? entry[0] : null;
}

// PLAN.md §8: current filtered view to .xlsx, all columns plus ageing and
// the overdue flag.
export async function exportSnagsToExcel(snags: SnagRow[], warehouseName: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Snags");

  sheet.columns = [
    { header: "S.No", key: "serial_no", width: 8 },
    { header: "Date Raised", key: "date_raised", width: 13 },
    { header: "Raised By", key: "raised_by", width: 22 },
    { header: "Description", key: "description", width: 45 },
    { header: "Category", key: "category", width: 10 },
    { header: "Sub-category", key: "sub_category", width: 14 },
    { header: "Location", key: "location", width: 16 },
    { header: "Scope", key: "scope", width: 10 },
    { header: "Severity", key: "severity", width: 10 },
    { header: "Status", key: "status", width: 13 },
    { header: "ETC", key: "etc_date", width: 13 },
    { header: "Ageing (days)", key: "ageing", width: 13 },
    { header: "Overdue", key: "overdue", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const s of snags) {
    const subCategory =
      s.sub_category === "others" && s.sub_category_other
        ? s.sub_category_other
        : SUB_CATEGORY_LABELS[s.sub_category] ?? s.sub_category;
    sheet.addRow({
      serial_no: s.serial_no,
      date_raised: s.date_raised,
      raised_by: s.raised_by_profile?.full_name ?? s.raised_by_profile?.email ?? "",
      description: s.description,
      category: CATEGORY_LABELS[s.category] ?? s.category,
      sub_category: subCategory,
      location: LOCATION_LABELS[s.location] ?? s.location,
      scope: SCOPE_LABELS[s.scope] ?? s.scope,
      severity: SEVERITY_LABELS[s.severity] ?? s.severity,
      status: STATUS_LABELS[s.status] ?? s.status,
      etc_date: s.etc_date ?? "",
      ageing: ageingDays(s.date_raised, s.closed_at),
      overdue: isOverdue(s.etc_date, s.status) ? "Yes" : "No",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `${warehouseName.replace(/[^\w-]+/g, "_")}-snags.xlsx`);
}

const IMPORT_HEADERS = [
  "Description",
  "Category",
  "Sub-category",
  "Sub-category Other",
  "Location",
  "Scope",
  "Severity",
] as const;

export async function downloadImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import");

  sheet.columns = IMPORT_HEADERS.map((h) => ({ header: h, key: h, width: h === "Description" ? 45 : 20 }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    Description: "Evaporator fan not coming back on after defrost cycle",
    Category: "HVAC",
    "Sub-category": "ODU",
    "Sub-category Other": "",
    Location: "Frozen chamber",
    Scope: "Infra",
    Severity: "High",
  });

  const notesRow = sheet.addRow({
    Description: "↑ Example row — delete before importing.",
    Category: `Valid: ${Object.values(CATEGORY_LABELS).join(" / ")}`,
    "Sub-category": `Valid: ${Object.values(SUB_CATEGORY_LABELS).join(" / ")}`,
    "Sub-category Other": "Required only when Sub-category is Others",
    Location: `Valid: ${Object.values(LOCATION_LABELS).join(" / ")}`,
    Scope: `Valid: ${Object.values(SCOPE_LABELS).join(" / ")}`,
    Severity: `Valid: ${Object.values(SEVERITY_LABELS).join(" / ")}. High means this stops the warehouse launching.`,
  });
  notesRow.font = { italic: true, color: { argb: "FF8A7A75" } };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, "snag-import-template.xlsx");
}

export type ImportRow = {
  rowNumber: number;
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
};

export type ImportRowError = { rowNumber: number; message: string };

export async function parseImportFile(
  file: File
): Promise<{ rows: ImportRow[]; errors: ImportRowError[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const [description, categoryLabel, subCategoryLabel, subCategoryOther, locationLabel, scopeLabel, severityLabel] =
      [1, 2, 3, 4, 5, 6, 7].map((i) => String(row.getCell(i).value ?? "").trim());

    if (!description && !categoryLabel && !subCategoryLabel) return; // blank row

    // Skip the example/notes rows the template ships with.
    if (description.startsWith("↑ Example row")) return;

    if (!description) {
      errors.push({ rowNumber, message: "Description is required." });
      return;
    }

    const category = reverseLookup(CATEGORY_LABELS, categoryLabel);
    if (!category) {
      errors.push({ rowNumber, message: `"${categoryLabel}" is not a valid Category.` });
      return;
    }
    const subCategory = reverseLookup(SUB_CATEGORY_LABELS, subCategoryLabel);
    if (!subCategory) {
      errors.push({ rowNumber, message: `"${subCategoryLabel}" is not a valid Sub-category.` });
      return;
    }
    if (subCategory === "others" && !subCategoryOther) {
      errors.push({ rowNumber, message: "Sub-category Other is required when Sub-category is Others." });
      return;
    }
    const location = reverseLookup(LOCATION_LABELS, locationLabel);
    if (!location) {
      errors.push({ rowNumber, message: `"${locationLabel}" is not a valid Location.` });
      return;
    }
    const scope = reverseLookup(SCOPE_LABELS, scopeLabel);
    if (!scope) {
      errors.push({ rowNumber, message: `"${scopeLabel}" is not a valid Scope.` });
      return;
    }
    const severity = reverseLookup(SEVERITY_LABELS, severityLabel);
    if (!severity) {
      errors.push({ rowNumber, message: `"${severityLabel}" is not a valid Severity.` });
      return;
    }

    rows.push({
      rowNumber,
      description,
      category,
      subCategory,
      subCategoryOther: subCategory === "others" ? subCategoryOther : null,
      location,
      scope,
      severity,
    });
  });

  return { rows, errors };
}
