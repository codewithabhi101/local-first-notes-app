import Dexie, { Table } from 'dexie';
import CryptoJS from 'crypto-js';

// --- IndexedDB schema (via Dexie) ---
interface NoteRow {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags?: string;
  created_at: number;
  updated_at: number;
  sync_status: string;
  server_id?: string;
  image_uri?: string;
  last_opened_at?: number;
  has_conflict?: number;
  server_title?: string;
  server_content?: string;
  server_updated_at?: number;
}

class NotesDB extends Dexie {
  notes!: Table<NoteRow, string>;
  constructor() {
    super('notes_db');
    this.version(1).stores({
      notes: 'id, updated_at, folder, last_opened_at',
    });
  }
}

const idb = new NotesDB();

// Exported for parity with the mobile file's `export const db` — not used
// directly elsewhere, but kept so any code importing `{ db }` still works.
export const db = idb;

// --- Encryption (same approach as mobile, key stored in localStorage
// instead of expo-secure-store, since that's the practical equivalent
// available in a browser) ---
const KEY_STORAGE_NAME = 'notes_encryption_key_v1';
let encryptionKey = '';

function getOrCreateEncryptionKey(): string {
  let key = localStorage.getItem(KEY_STORAGE_NAME);
  if (!key) {
    key = CryptoJS.lib.WordArray.random(32).toString();
    localStorage.setItem(KEY_STORAGE_NAME, key);
  }
  return key;
}

function encrypt(plainText: string): string {
  if (!plainText) return '';
  return CryptoJS.AES.encrypt(plainText, encryptionKey).toString();
}

function decrypt(cipherText: string): string {
  if (!cipherText) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, encryptionKey);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    return result || cipherText;
  } catch (e) {
    return cipherText;
  }
}

function decryptRow(row: NoteRow): any {
  if (!row) return row;
  return {
    ...row,
    title: decrypt(row.title),
    content: decrypt(row.content),
    server_title: row.has_conflict ? decrypt(row.server_title || '') : row.server_title,
    server_content: row.has_conflict ? decrypt(row.server_content || '') : row.server_content,
  };
}

// --- In-memory cache backed by IndexedDB ---
// IndexedDB is asynchronous, but every other file in this app calls these
// functions synchronously (e.g. `const note = getNoteById(id)` used
// immediately). To keep that working with zero changes elsewhere, we load
// everything into memory once at startup, read/write the cache instantly,
// and persist each change to IndexedDB in the background.
let notesCache: NoteRow[] = [];

function persist(row: NoteRow) {
  idb.notes.put(row).catch((e) => console.log('[web-db] persist failed', e));
}

function persistDelete(id: string) {
  idb.notes.delete(id).catch((e) => console.log('[web-db] delete failed', e));
}

export const initDB = async () => {
  encryptionKey = getOrCreateEncryptionKey();
  notesCache = await idb.notes.toArray();
  // Backfill last_opened_at for notes that predate the History feature.
  notesCache = notesCache.map((n) =>
    n.last_opened_at == null ? { ...n, last_opened_at: n.created_at } : n
  );
  notesCache.forEach(persist);
};

export const getAllNotes = () => {
  const sorted = [...notesCache].sort((a, b) => b.updated_at - a.updated_at);
  return sorted.map(decryptRow);
};

export const getNoteById = (id: string) => {
  const row = notesCache.find((n) => n.id === id);
  return row ? decryptRow(row) : null;
};

export const createNote = (id: string, title: string, content: string, folder: string) => {
  const now = Date.now();
  const row: NoteRow = {
    id, title: encrypt(title), content: encrypt(content), folder,
    created_at: now, updated_at: now, sync_status: 'pending_sync',
  };
  notesCache.push(row);
  persist(row);
};

export const updateNote = (id: string, title: string, content: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.title = encrypt(title);
  row.content = encrypt(content);
  row.updated_at = Date.now();
  row.sync_status = 'pending_sync';
  persist(row);
};

export const updateNoteTags = (id: string, tags: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.tags = tags;
  row.updated_at = Date.now();
  row.sync_status = 'pending_sync';
  persist(row);
};

export const updateNoteImage = (id: string, imageUri: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.image_uri = imageUri;
  row.updated_at = Date.now();
  row.sync_status = 'pending_sync';
  persist(row);
};

export const deleteNote = (id: string) => {
  notesCache = notesCache.filter((n) => n.id !== id);
  persistDelete(id);
};

export const markSynced = (id: string, serverId: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.sync_status = 'synced';
  row.server_id = serverId;
  persist(row);
};

export const getAllFolders = () => {
  const folders = new Set(notesCache.map((n) => n.folder).filter(Boolean));
  return Array.from(folders).map((folder) => ({ folder }));
};

export const upsertFromServer = (note: any) => {
  const existing = notesCache.find((n) => n.id === note.id);
  if (existing) {
    const localHasUnsyncedEdit = existing.sync_status === 'pending_sync';
    const serverIsNewer = note.updated_at > existing.updated_at;

    if (localHasUnsyncedEdit && serverIsNewer) {
      existing.has_conflict = 1;
      existing.server_title = note.title;
      existing.server_content = note.content;
      existing.server_updated_at = note.updated_at;
      persist(existing);
    } else if (serverIsNewer) {
      existing.title = note.title;
      existing.content = note.content;
      existing.folder = note.folder;
      existing.updated_at = note.updated_at;
      existing.sync_status = 'synced';
      persist(existing);
    }
  } else {
    const row: NoteRow = {
      id: note.id, title: note.title, content: note.content, folder: note.folder,
      created_at: note.created_at, updated_at: note.updated_at,
      sync_status: 'synced', last_opened_at: note.created_at,
    };
    notesCache.push(row);
    persist(row);
  }
};

export const resolveConflictKeepMine = (id: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.has_conflict = 0;
  row.server_title = undefined;
  row.server_content = undefined;
  row.server_updated_at = undefined;
  row.sync_status = 'pending_sync';
  persist(row);
};

export const resolveConflictKeepServer = (id: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.title = row.server_title || row.title;
  row.content = row.server_content || row.content;
  row.updated_at = row.server_updated_at || Date.now();
  row.sync_status = 'synced';
  row.has_conflict = 0;
  row.server_title = undefined;
  row.server_content = undefined;
  row.server_updated_at = undefined;
  persist(row);
};

export const markNoteOpened = (id: string) => {
  const row = notesCache.find((n) => n.id === id);
  if (!row) return;
  row.last_opened_at = Date.now();
  persist(row);
};

export const getHistory = () => {
  const rows = notesCache
    .filter((n) => n.last_opened_at != null)
    .sort((a, b) => (b.last_opened_at || 0) - (a.last_opened_at || 0));
  return rows.map(decryptRow);
};

export const clearHistory = () => {
  const ids = notesCache.map((n) => n.id);
  notesCache = [];
  ids.forEach(persistDelete);
};