// Persistencia local con IndexedDB (los GIFs se guardan como Blob).

const DB = "orbis-historias";
const STORE = "proyecto";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function saveProject(project) {
  try {
    await tx("readwrite", (s) => s.put(project, "actual"));
  } catch (e) {
    console.warn("No se pudo guardar el proyecto", e);
  }
}

export async function loadProject() {
  try {
    return await tx("readonly", (s) => s.get("actual"));
  } catch {
    return null;
  }
}
