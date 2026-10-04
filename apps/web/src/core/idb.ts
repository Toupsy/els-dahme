/** Kleiner Promise-Wrapper um IndexedDB. Eine Datenbank, wenige Speicher. */

export const STORES = ["meta", "log", "outbox", "rejected"] as const;
export type StoreName = (typeof STORES)[number];

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Transaktion abgebrochen"));
    tx.onerror = () => reject(tx.error);
  });
}

export function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("meta");
      db.createObjectStore("log", { keyPath: "seq" });
      db.createObjectStore("outbox", { keyPath: "order", autoIncrement: true }).createIndex("id", "intent.id", {
        unique: true,
      });
      db.createObjectStore("rejected", { keyPath: "intent.id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("Lokale Datenbank ist blockiert. Andere Tabs schließen."));
  });
}

export function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase(name);
    del.onsuccess = () => resolve();
    del.onerror = () => reject(del.error);
    del.onblocked = () => resolve();
  });
}
