// Offline-first raise queue (PLAN.md §5.7). The client generates the snag's
// id locally since serial_no can only be allocated server-side at sync time
// — the UI shows "pending" until the RPC call actually lands.

const DB_NAME = "snag-offline-queue";
const STORE = "pending-snags";

export type QueuedSnag = {
  localId: string;
  warehouseId: string;
  warehouseName: string;
  description: string;
  category: string;
  subCategory: string;
  subCategoryOther: string | null;
  location: string;
  scope: string;
  severity: string;
  photoAnnotated: Blob | null;
  photoOriginal: Blob | null;
  photoThumbnail: Blob | null;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "localId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSnag(item: QueuedSnag): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedSnags(): Promise<QueuedSnag[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedSnag[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedSnag(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
