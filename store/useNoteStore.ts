import { create } from 'zustand';
import * as db from '../db/database';
import { syncPendingNotes } from '../sync/syncEngine';

type Note = {
  id: string; title: string; content: string; folder: string;
  tags?: string | null;
  created_at: number; updated_at: number; sync_status: string;
  image_uri?: string | null;
  last_opened_at?: number | null;
  has_conflict?: number;
  server_title?: string | null;
  server_content?: string | null;
};

type NoteStore = {
  notes: Note[];
  history: Note[];
  activeFolder: string | null;
  loadNotes: () => void;
  addNote: (title: string, content: string, folder: string) => string;
  editNote: (id: string, title: string, content: string) => void;
  removeNote: (id: string) => void;
  setActiveFolder: (folder: string | null) => void;
  setNoteImage: (id: string, imageUri: string) => void;
  clearNoteImage: (id: string) => void;
  setNoteTags: (id: string, tags: string) => void;
  loadHistory: () => void;
  markNoteOpened: (id: string) => void;
  clearHistory: () => void;
  resolveConflictKeepMine: (id: string) => void;
  resolveConflictKeepServer: (id: string) => void;
};

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  history: [],
  activeFolder: null,
  loadNotes: () => set({ notes: db.getAllNotes() as Note[] }),
  addNote: (title, content, folder) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    db.createNote(id, title, content, folder);
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
    return id;
  },
  editNote: (id, title, content) => {
    db.updateNote(id, title, content);
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
  },
  removeNote: (id) => {
    db.deleteNote(id);
    get().loadNotes();
    get().loadHistory();
  },
  setActiveFolder: (folder) => set({ activeFolder: folder }),
  setNoteImage: (id, imageUri) => {
    db.updateNoteImage(id, imageUri);
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
  },
  clearNoteImage: (id) => {
    db.updateNoteImage(id, '');
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
  },
  setNoteTags: (id, tags) => {
    db.updateNoteTags(id, tags);
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
  },
  loadHistory: () => set({ history: db.getHistory() as Note[] }),
  markNoteOpened: (id) => {
    db.markNoteOpened(id);
    get().loadHistory();
  },
  clearHistory: () => {
    db.clearHistory();
    set({ history: [], notes: [] });
  },
  resolveConflictKeepMine: (id) => {
    db.resolveConflictKeepMine(id);
    get().loadNotes();
    syncPendingNotes().then(() => get().loadNotes());
  },
  resolveConflictKeepServer: (id) => {
    db.resolveConflictKeepServer(id);
    get().loadNotes();
  },
}));