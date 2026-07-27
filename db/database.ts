import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

export const db = SQLite.openDatabaseSync('notes.db');

const KEY_STORAGE_NAME = 'notes_encryption_key_v1';
let encryptionKey = '';

async function getOrCreateEncryptionKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
  if (!key) {
    key = CryptoJS.lib.WordArray.random(32).toString();
    await SecureStore.setItemAsync(KEY_STORAGE_NAME, key);
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

function decryptRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    title: decrypt(row.title),
    content: decrypt(row.content),
    server_title: row.has_conflict ? decrypt(row.server_title) : row.server_title,
    server_content: row.has_conflict ? decrypt(row.server_content) : row.server_content,
  };
}

export const initDB = async () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      folder TEXT,
      tags TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      sync_status TEXT DEFAULT 'pending_sync',
      server_id TEXT,
      image_uri TEXT,
      last_opened_at INTEGER,
      has_conflict INTEGER DEFAULT 0,
      server_title TEXT,
      server_content TEXT,
      server_updated_at INTEGER
    );
  `);

  try { db.execSync(`ALTER TABLE notes ADD COLUMN image_uri TEXT;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN last_opened_at INTEGER;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN has_conflict INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN server_title TEXT;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN server_content TEXT;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN server_updated_at INTEGER;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE notes ADD COLUMN tags TEXT;`); } catch (e) {}

  db.runSync(`UPDATE notes SET last_opened_at = created_at WHERE last_opened_at IS NULL;`);

  encryptionKey = await getOrCreateEncryptionKey();
};

export const getAllNotes = () => {
  const rows = db.getAllSync('SELECT * FROM notes ORDER BY updated_at DESC') as any[];
  return rows.map(decryptRow);
};

export const getNoteById = (id: string) => {
  const row = db.getFirstSync('SELECT * FROM notes WHERE id=?', [id]) as any;
  return decryptRow(row);
};

export const createNote = (id: string, title: string, content: string, folder: string) => {
  const now = Date.now();
  db.runSync(
    'INSERT INTO notes (id, title, content, folder, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, encrypt(title), encrypt(content), folder, now, now, 'pending_sync']
  );
};

export const updateNote = (id: string, title: string, content: string) => {
  db.runSync(
    'UPDATE notes SET title=?, content=?, updated_at=?, sync_status=? WHERE id=?',
    [encrypt(title), encrypt(content), Date.now(), 'pending_sync', id]
  );
};

// Tags are stored as a plain comma-separated string (e.g. "urgent,ideas").
// Not encrypted, same as folder — this keeps them usable for fast local
// filtering without needing to decrypt every row just to check tags.
export const updateNoteTags = (id: string, tags: string) => {
  db.runSync(
    'UPDATE notes SET tags=?, updated_at=?, sync_status=? WHERE id=?',
    [tags, Date.now(), 'pending_sync', id]
  );
};

export const updateNoteImage = (id: string, imageUri: string) => {
  db.runSync(
    'UPDATE notes SET image_uri=?, updated_at=?, sync_status=? WHERE id=?',
    [imageUri, Date.now(), 'pending_sync', id]
  );
};

export const deleteNote = (id: string) => {
  db.runSync('DELETE FROM notes WHERE id=?', [id]);
};

export const markSynced = (id: string, serverId: string) => {
  db.runSync('UPDATE notes SET sync_status=?, server_id=? WHERE id=?', ['synced', serverId, id]);
};

export const getAllFolders = () =>
  db.getAllSync(
    'SELECT DISTINCT folder FROM notes WHERE folder IS NOT NULL AND folder != ""'
  ) as { folder: string }[];

export const upsertFromServer = (note: any) => {
  const existing = db.getFirstSync('SELECT * FROM notes WHERE id = ?', [note.id]) as any;
  if (existing) {
    const localHasUnsyncedEdit = existing.sync_status === 'pending_sync';
    const serverIsNewer = note.updated_at > existing.updated_at;

    if (localHasUnsyncedEdit && serverIsNewer) {
      db.runSync(
        'UPDATE notes SET has_conflict=1, server_title=?, server_content=?, server_updated_at=? WHERE id=?',
        [note.title, note.content, note.updated_at, note.id]
      );
    } else if (serverIsNewer) {
      db.runSync(
        'UPDATE notes SET title=?, content=?, folder=?, updated_at=?, sync_status=? WHERE id=?',
        [note.title, note.content, note.folder, note.updated_at, 'synced', note.id]
      );
    }
  } else {
    db.runSync(
      'INSERT INTO notes (id, title, content, folder, created_at, updated_at, sync_status, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [note.id, note.title, note.content, note.folder, note.created_at, note.updated_at, 'synced', note.created_at]
    );
  }
};

export const resolveConflictKeepMine = (id: string) => {
  db.runSync(
    'UPDATE notes SET has_conflict=0, server_title=NULL, server_content=NULL, server_updated_at=NULL, sync_status=? WHERE id=?',
    ['pending_sync', id]
  );
};

export const resolveConflictKeepServer = (id: string) => {
  const row = db.getFirstSync('SELECT * FROM notes WHERE id=?', [id]) as any;
  if (!row) return;
  db.runSync(
    'UPDATE notes SET title=?, content=?, updated_at=?, sync_status=?, has_conflict=0, server_title=NULL, server_content=NULL, server_updated_at=NULL WHERE id=?',
    [row.server_title, row.server_content, row.server_updated_at, 'synced', id]
  );
};

export const markNoteOpened = (id: string) => {
  db.runSync('UPDATE notes SET last_opened_at=? WHERE id=?', [Date.now(), id]);
};

export const getHistory = () => {
  const rows = db.getAllSync(
    'SELECT * FROM notes WHERE last_opened_at IS NOT NULL ORDER BY last_opened_at DESC'
  ) as any[];
  return rows.map(decryptRow);
};

export const clearHistory = () => {
  db.runSync('DELETE FROM notes;');
};