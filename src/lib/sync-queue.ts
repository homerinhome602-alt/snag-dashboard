import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/media";
import { listQueuedSnags, removeQueuedSnag, type QueuedSnag } from "@/lib/offline-queue";

// Flushes the offline queue: raises each snag with its client-generated id
// (raise_snag accepts p_id for exactly this), then uploads its photo if any.
// Stops at the first item that fails so a warehouse-membership or network
// error doesn't silently drop the rest of the queue out of order.
export async function syncOfflineQueue(): Promise<{ synced: string[]; error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { synced: [], error: null };

  const queue = await listQueuedSnags();
  const synced: string[] = [];

  for (const item of queue) {
    const result = await syncOne(supabase, item, user.id);
    if (result.error) {
      return { synced, error: `${item.description.slice(0, 40)}…: ${result.error}` };
    }
    await removeQueuedSnag(item.localId);
    synced.push(item.localId);
  }

  return { synced, error: null };
}

async function syncOne(
  supabase: ReturnType<typeof createClient>,
  item: QueuedSnag,
  uploaderId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .rpc("raise_snag", {
      p_warehouse_id: item.warehouseId,
      p_description: item.description,
      p_category: item.category,
      p_sub_category: item.subCategory,
      p_sub_category_other: item.subCategoryOther,
      p_location: item.location,
      p_scope: item.scope,
      p_severity: item.severity,
      p_id: item.localId,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  const snagId = (data as { id: string }).id;

  if (item.photoAnnotated && item.photoOriginal && item.photoThumbnail) {
    const upload = await uploadAttachment(supabase, {
      warehouseId: item.warehouseId,
      snagId,
      mediaType: "image",
      file: item.photoAnnotated,
      original: item.photoOriginal,
      thumbnail: item.photoThumbnail,
      fileName: "snag-photo.jpg",
      uploaderId,
    });
    if (upload.error) return { error: upload.error };
  }

  return { error: null };
}
