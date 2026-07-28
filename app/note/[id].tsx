import { View, TextInput, Button, Alert, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import { getNoteById } from '../../db/database';
import { useNoteStore } from '../../store/useNoteStore';

const TEAL = '#0f3c44';

export default function NoteEditor() {
  const { id, folder, title: titleParam } = useLocalSearchParams();
  const isNew = id === 'new';
  const folderParam = (folder as string) || 'General';
  const openedFromChip = typeof titleParam === 'string' && titleParam.length > 0;

  const {
    addNote, editNote, removeNote, setActiveFolder, markNoteOpened,
    resolveConflictKeepMine, resolveConflictKeepServer, setNoteTags,
  } = useNoteStore();
  const router = useRouter();

  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [conflict, setConflict] = useState<{ serverTitle: string; serverContent: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const defaultTitleRef = useRef('');
  // Holds the pending autosave timer so the Save button can cancel it and
  // save immediately instead of waiting for the debounce delay.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToBlankNote = () => {
    const prefilled = openedFromChip ? (titleParam as string) : '';
    setNoteId(null);
    setTitle(prefilled);
    setContent('');
    setTags('');
    defaultTitleRef.current = prefilled;
    setConflict(null);
    setPreviewMode(false);
  };

  const loadExistingNote = (noteIdFromRoute: string) => {
    setNoteId(noteIdFromRoute);
    const note = getNoteById(noteIdFromRoute);
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTags(note.tags || '');
      if (note.has_conflict) {
        setConflict({ serverTitle: note.server_title || '', serverContent: note.server_content || '' });
      } else {
        setConflict(null);
      }
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setConflict(null);
    }
    defaultTitleRef.current = '';
    markNoteOpened(noteIdFromRoute);
    setPreviewMode(false);
  };

  useEffect(() => {
    if (isNew) {
      resetToBlankNote();
    } else {
      loadExistingNote(id as string);
    }
  }, [id, folder, titleParam]);

  // The actual save logic — creates the note if it doesn't exist yet, or
  // updates it if it does. Shared by both the autosave timer and the
  // explicit Save button, so they always behave identically.
  const performSave = (): string | null => {
    const titleChangedByUser = title.trim() !== defaultTitleRef.current.trim();
    const hasRealContent = content.trim().length > 0 || titleChangedByUser || tags.trim().length > 0;

    if (!noteId) {
      if (!hasRealContent) return null; // nothing to save yet
      const newId = addNote(title, content, folderParam);
      setNoteId(newId);
      markNoteOpened(newId);
      if (tags.trim()) setNoteTags(newId, tags);
      return newId;
    } else if (!conflict) {
      editNote(noteId, title, content);
      setNoteTags(noteId, tags);
      return noteId;
    }
    return noteId;
  };

  // Autosave: still runs in the background 400ms after you stop typing,
  // so nothing is lost even if you never tap Save.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, content, tags]);

  // Explicit Save button — cancels the pending autosave timer, saves right
  // now, and takes you back to the list so you can see it there immediately.
  const handleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const savedId = performSave();
    if (!savedId) {
      Alert.alert('Nothing to save', 'Write a title or some content first.');
      return;
    }
    setActiveFolder(null);
    router.back();
  };

  const handleBack = () => {
    setActiveFolder(null);
    router.back();
  };

  const handleDelete = () => {
    if (!noteId) {
      router.back();
      return;
    }
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeNote(noteId);
          router.back();
        },
      },
    ]);
  };

  const handleKeepMine = () => {
    if (!noteId) return;
    resolveConflictKeepMine(noteId);
    setConflict(null);
  };

  const handleUseServerVersion = () => {
    if (!noteId || !conflict) return;
    resolveConflictKeepServer(noteId);
    setTitle(conflict.serverTitle);
    setContent(conflict.serverContent);
    setConflict(null);
  };

  const wrapSelection = (before: string, after: string = before) => {
    const { start, end } = selection;
    const selected = content.slice(start, end);
    const newText = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(newText);
  };

  const prefixLine = (prefix: string) => {
    const { start } = selection;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newText = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(newText);
  };

  const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={handleBack} style={styles.sideButton}>
          <Text style={styles.sideButtonText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      {conflict && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictTitle}>⚠ This note was also edited on another device</Text>
          <Text style={styles.conflictSubtitle}>Your version (shown below):</Text>
          <Text style={styles.conflictPreview} numberOfLines={2}>{title || '(no title)'} — {content || '(empty)'}</Text>
          <Text style={styles.conflictSubtitle}>Other device's version:</Text>
          <Text style={styles.conflictPreview} numberOfLines={2}>
            {conflict.serverTitle || '(no title)'} — {conflict.serverContent || '(empty)'}
          </Text>
          <View style={styles.conflictButtons}>
            <TouchableOpacity style={styles.conflictButton} onPress={handleKeepMine}>
              <Text style={styles.conflictButtonText}>Keep Mine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.conflictButton, styles.conflictButtonAlt]} onPress={handleUseServerVersion}>
              <Text style={styles.conflictButtonText}>Use Other Version</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ flex: 1, padding: 16 }}>
        <TextInput value={title} onChangeText={setTitle} style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }} placeholder="Title" />

        <TextInput
          value={tags}
          onChangeText={setTags}
          placeholder="Add tags, separated by commas (e.g. urgent, ideas)"
          style={styles.tagsInput}
        />
        {tagList.length > 0 && (
          <View style={styles.tagChipsRow}>
            {tagList.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolbarButton} onPress={() => wrapSelection('**')}>
            <Text style={styles.toolbarButtonTextBold}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarButton} onPress={() => wrapSelection('*')}>
            <Text style={styles.toolbarButtonTextItalic}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarButton} onPress={() => prefixLine('# ')}>
            <Text style={styles.toolbarButtonText}>H1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarButton} onPress={() => prefixLine('- ')}>
            <Text style={styles.toolbarButtonText}>• List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.previewToggle, previewMode && styles.previewToggleActive]}
            onPress={() => setPreviewMode((p) => !p)}
          >
            <Text style={[styles.toolbarButtonText, previewMode && { color: '#fff' }]}>
              {previewMode ? 'Edit' : 'Preview'}
            </Text>
          </TouchableOpacity>
        </View>

        {previewMode ? (
          <ScrollView style={{ flex: 1, marginTop: 8 }}>
            <Markdown>{content || '*Nothing to preview yet*'}</Markdown>
          </ScrollView>
        ) : (
          <TextInput
            value={content}
            onChangeText={setContent}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            multiline
            style={{ flex: 1, textAlignVertical: 'top', marginTop: 8 }}
            placeholder="Start writing... (supports **bold**, *italic*, # headings, - lists)"
          />
        )}

        <Button title="Delete Note" color="red" onPress={handleDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: TEAL, paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
  },
  sideButton: { width: 70 },
  sideButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  saveButtonText: { color: TEAL, fontSize: 15, fontWeight: '700' },
  conflictBanner: {
    backgroundColor: '#fff4e5', borderBottomWidth: 1, borderBottomColor: '#f0c987',
    padding: 14,
  },
  conflictTitle: { fontWeight: '700', color: '#7a4a00', marginBottom: 6 },
  conflictSubtitle: { fontSize: 12, color: '#7a4a00', marginTop: 6, fontWeight: '600' },
  conflictPreview: { fontSize: 13, color: '#444' },
  conflictButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  conflictButton: {
    flex: 1, backgroundColor: '#0f3c44', paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  conflictButtonAlt: { backgroundColor: '#6b6b6b' },
  conflictButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  tagsInput: {
    fontSize: 13, color: '#555', backgroundColor: '#f5f4f0',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  tagChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChip: { backgroundColor: '#dbe7ee', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagChipText: { fontSize: 12, color: '#16323a', fontWeight: '600' },
  toolbar: {
    flexDirection: 'row', gap: 8, marginTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  toolbarButton: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f0f0f0',
  },
  toolbarButtonText: { fontSize: 13, fontWeight: '600', color: '#333' },
  toolbarButtonTextBold: { fontSize: 14, fontWeight: '900', color: '#333' },
  toolbarButtonTextItalic: { fontSize: 14, fontStyle: 'italic', fontWeight: '700', color: '#333' },
  previewToggle: { marginLeft: 'auto', backgroundColor: '#dbe7ee' },
  previewToggleActive: { backgroundColor: TEAL },
});