"use server";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/data/server";
import { isEffectiveAdmin } from "@/lib/roles";
import { BUCKET, MAX_BYTES, ALLOWED_DOC_MIME } from "@/lib/storage/local";

const STORAGE_ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage");
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};

type Result = { error: string | null };

async function actorId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

// Both handover documents and chamber details can be maintained by anyone tagged
// to the warehouse (or a Dashboard Admin). RLS enforces this too, but an
// UPDATE/DELETE blocked by RLS is a silent 0-row no-op, so guard explicitly
// before touching the filesystem or writing activity.
async function assertMember(warehouseId: string, uid: string | null): Promise<string | null> {
  if (!uid) return "Not signed in.";
  const supabase = await createClient();
  const [{ data: me }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("is_dashboard_admin, is_active").eq("id", uid).maybeSingle(),
    // warehouse_members' own RLS already excludes a deactivated member's
    // rows (private.is_warehouse_member() gates on is_active), so this half
    // needs no extra check — only isEffectiveAdmin(me) does.
    supabase.from("warehouse_members").select("role").eq("warehouse_id", warehouseId).eq("user_id", uid),
  ]);
  const ok = isEffectiveAdmin(me) || ((membership ?? []) as unknown[]).length > 0;
  return ok ? null : "You don't have access to this warehouse.";
}

// ── handover documents ────────────────────────────────────────────────────

export async function uploadHandoverDocument(formData: FormData): Promise<Result> {
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const docTypeId = String(formData.get("docTypeId") ?? "");
  const file = formData.get("file");
  if (!warehouseId || !docTypeId) return { error: "Missing fields." };
  if (!(file instanceof File)) return { error: "No file." };
  if (file.size > MAX_BYTES) return { error: "File exceeds the 50 MB limit." };
  if (!ALLOWED_DOC_MIME.has(file.type)) return { error: `Unsupported file type: ${file.type || "unknown"}` };

  const supabase = await createClient();
  const uid = await actorId();
  const denied = await assertMember(warehouseId, uid);
  if (denied) return { error: denied };

  const { data: docType } = await supabase
    .from("handover_document_types")
    .select("name")
    .eq("id", docTypeId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("warehouse_handover_documents")
    .select("id, file_url")
    .eq("warehouse_id", warehouseId)
    .eq("doc_type_id", docTypeId)
    .maybeSingle();

  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const key = `${warehouseId}/handover/${docTypeId}-${randomUUID().slice(0, 8)}.${ext}`;
  const dest = path.join(STORAGE_ROOT, BUCKET, key);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
    await fs.writeFile(dest + ".meta.json", JSON.stringify({ contentType: file.type, size: file.size }));
  } catch (e) {
    return { error: `Storage write failed: ${(e as Error).message}` };
  }

  const now = new Date().toISOString();
  const row = {
    warehouse_id: warehouseId,
    doc_type_id: docTypeId,
    file_url: key,
    file_name: file.name,
    file_size: file.size,
    uploaded_by: uid,
    uploaded_at: now,
    // the tick is automatic — a file being present is what "complete" means
    checked: true,
    checked_by: uid,
    checked_at: now,
  };
  const { error } = existing
    ? await supabase.from("warehouse_handover_documents").update(row).eq("id", existing.id)
    : await supabase.from("warehouse_handover_documents").insert(row);

  if (error) {
    await fs.rm(dest, { force: true });
    await fs.rm(dest + ".meta.json", { force: true });
    return { error: error.message };
  }

  // old file no longer referenced
  if (existing?.file_url && existing.file_url !== key) {
    await fs.rm(path.join(STORAGE_ROOT, BUCKET, existing.file_url), { force: true });
    await fs.rm(path.join(STORAGE_ROOT, BUCKET, existing.file_url + ".meta.json"), { force: true });
  }

  await supabase.from("warehouse_asset_activity").insert({
    warehouse_id: warehouseId,
    actor_id: uid,
    area: "handover_document",
    ref_label: docType?.name ?? null,
    action: existing?.file_url ? "replace" : "upload",
    detail: file.name,
  });

  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}

export async function removeHandoverDocument(warehouseId: string, docTypeId: string): Promise<Result> {
  const supabase = await createClient();
  const uid = await actorId();
  const denied = await assertMember(warehouseId, uid);
  if (denied) return { error: denied };

  const [{ data: existing }, { data: docType }] = await Promise.all([
    supabase
      .from("warehouse_handover_documents")
      .select("id, file_url")
      .eq("warehouse_id", warehouseId)
      .eq("doc_type_id", docTypeId)
      .maybeSingle(),
    supabase.from("handover_document_types").select("name").eq("id", docTypeId).maybeSingle(),
  ]);
  if (!existing) return { error: null };

  const { error } = await supabase
    .from("warehouse_handover_documents")
    .update({ file_url: null, file_name: null, file_size: null, uploaded_by: null, uploaded_at: null, checked: false, checked_by: null, checked_at: null })
    .eq("id", existing.id);
  if (error) return { error: error.message };

  if (existing.file_url) {
    await fs.rm(path.join(STORAGE_ROOT, BUCKET, existing.file_url), { force: true });
    await fs.rm(path.join(STORAGE_ROOT, BUCKET, existing.file_url + ".meta.json"), { force: true });
  }

  await supabase.from("warehouse_asset_activity").insert({
    warehouse_id: warehouseId,
    actor_id: uid,
    area: "handover_document",
    ref_label: docType?.name ?? null,
    action: "remove",
  });

  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}

// ── chambers ─────────────────────────────────────────────────────────────

export type ChamberInput = {
  chamber_name: string;
  machine_count: number | null;
  machine_capacity_kw: number | null;
  odu_model: string | null;
  idu_model: string | null;
  controller_model: string | null;
};

function cleanChamber(input: ChamberInput) {
  return {
    chamber_name: input.chamber_name.trim(),
    machine_count: input.machine_count ?? null,
    machine_capacity_kw: input.machine_capacity_kw ?? null,
    odu_model: input.odu_model?.trim() || null,
    idu_model: input.idu_model?.trim() || null,
    controller_model: input.controller_model?.trim() || null,
  };
}

export async function addChamber(warehouseId: string, input: ChamberInput): Promise<Result> {
  const c = cleanChamber(input);
  if (!c.chamber_name) return { error: "Chamber name is required." };
  const supabase = await createClient();
  const uid = await actorId();
  const denied = await assertMember(warehouseId, uid);
  if (denied) return { error: denied };

  const { error } = await supabase
    .from("warehouse_chambers")
    .insert({ warehouse_id: warehouseId, ...c, created_by: uid, updated_by: uid });
  if (error) return { error: error.message };

  await supabase.from("warehouse_asset_activity").insert({
    warehouse_id: warehouseId, actor_id: uid, area: "chamber", ref_label: c.chamber_name, action: "add",
  });
  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}

export async function updateChamber(
  warehouseId: string,
  chamberId: string,
  input: ChamberInput
): Promise<Result> {
  const c = cleanChamber(input);
  if (!c.chamber_name) return { error: "Chamber name is required." };
  const supabase = await createClient();
  const uid = await actorId();
  const denied = await assertMember(warehouseId, uid);
  if (denied) return { error: denied };

  const { error } = await supabase
    .from("warehouse_chambers")
    .update({ ...c, updated_by: uid })
    .eq("id", chamberId)
    .eq("warehouse_id", warehouseId);
  if (error) return { error: error.message };

  await supabase.from("warehouse_asset_activity").insert({
    warehouse_id: warehouseId, actor_id: uid, area: "chamber", ref_label: c.chamber_name, action: "edit",
  });
  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}

export async function deleteChamber(warehouseId: string, chamberId: string): Promise<Result> {
  const supabase = await createClient();
  const uid = await actorId();
  const denied = await assertMember(warehouseId, uid);
  if (denied) return { error: denied };

  const { data: existing } = await supabase
    .from("warehouse_chambers")
    .select("chamber_name")
    .eq("id", chamberId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  const { error } = await supabase
    .from("warehouse_chambers")
    .delete()
    .eq("id", chamberId)
    .eq("warehouse_id", warehouseId);
  if (error) return { error: error.message };

  await supabase.from("warehouse_asset_activity").insert({
    warehouse_id: warehouseId, actor_id: uid, area: "chamber",
    ref_label: existing?.chamber_name ?? null, action: "delete",
  });
  revalidatePath(`/warehouses/${warehouseId}`);
  return { error: null };
}
