// Local-first media store (IndexedDB). Blobs never enter localStorage or the
// network while a book is being written: photo and audio bytes are encrypted
// with the designer's AES-GCM draft key and kept here, keyed to one
// designer + project + role + slot. Nothing here is ever written as plaintext,
// and callers must already have unlocked the draft key (see draftCrypto) before
// saving or reading.

const DB_NAME = 'dearune-draft-media'
const STORE = 'media'
const INDEX = 'projectKey'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex(INDEX, 'projectKey', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const request = fn(store)
    tx.oncomplete = () => resolve(request?.result ?? null)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Media store aborted'))
  })
}

// One stable key per pin/sound slot inside one project. The design keeps slots
// addressable so a retried upload/swap always hits the same record.
export function mediaStorageKey(designerId, projectId, role, slot) {
  return `${designerId}::${projectId}::${role}::${slot}`
}

export function projectKey(designerId, projectId) {
  return `${designerId}::${projectId}`
}

export function saveEncryptedMedia({
  designerId,
  projectId,
  role,
  slot,
  mimeType,
  sizeBytes,
  name,
  iv,
  data,
  addedAt = new Date().toISOString(),
  key = mediaStorageKey(designerId, projectId, role, slot),
}) {
  return withStore('readwrite', (store) => store.put({ key, projectKey: projectKey(designerId, projectId), role, slot, mimeType, sizeBytes, name, iv, data, addedAt }))
}

export function getEncryptedMedia(key) {
  if (!key) return Promise.resolve(null)
  return withStore('readonly', (store) => store.get(key))
}

export function deleteMedia(key) {
  if (!key) return Promise.resolve()
  return withStore('readwrite', (store) => {
    store.delete(key)
    return null
  })
}

export function listProjectMedia(designerId, projectId) {
  const pk = projectKey(designerId, projectId)
  return withStore('readonly', (store) => {
    const all = []
    const request = store.index(INDEX).openCursor(IDBKeyRange.only(pk))
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        all.push(cursor.value)
        cursor.continue()
      }
    }
    return all
  })
}

// When a book is closed (or lifted off the bench) the media it owns are
// removed from the device. This only touches this project's records.
export function deleteProjectMedia(designerId, projectId) {
  return withStore('readwrite', async (store) => {
    const index = store.index(INDEX)
    const range = IDBKeyRange.only(projectKey(designerId, projectId))
    const seen = await new Promise((resolve) => {
      const keys = []
      const request = index.openKeyCursor(range)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          keys.push(cursor.primaryKey)
          cursor.continue()
        } else {
          resolve(keys)
        }
      }
    })
    for (const key of seen) store.delete(key)
    return null
  })
}

export function wipeAllMedia() {
  return withStore('readwrite', (store) => {
    store.clear()
    return null
  })
}