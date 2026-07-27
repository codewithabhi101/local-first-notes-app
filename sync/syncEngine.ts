import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import { db, markSynced, upsertFromServer } from '../db/database';

const API_URL = 'https://local-first-notes-app.onrender.com/api/notes';

export async function syncPendingNotes() {
  const pending = db.getAllSync(
    `SELECT * FROM notes WHERE sync_status = 'pending_sync'`
  ) as any[];

  for (const note of pending) {
    try {
      const res = note.server_id
        ? await axios.put(`${API_URL}/${note.server_id}`, note)
        : await axios.post(API_URL, note);
      markSynced(note.id, res.data.id);
    } catch (e: any) {
      console.log('Sync failed for note', note.id, e.message);
    }
  }
}

export async function pullNotes() {
  try {
    const res = await axios.get(API_URL);
    res.data.forEach((note: any) => upsertFromServer(note));
  } catch (e: any) {
    console.log('Pull failed', e.message);
  }
}

export function startSyncListener() {
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      syncPendingNotes();
      pullNotes();
    }
  });
}