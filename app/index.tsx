import { View, FlatList, TouchableOpacity, Text, TextInput, StyleSheet, ImageBackground, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNoteStore } from '../store/useNoteStore';
import { pullNotes } from '../sync/syncEngine';

const FOLDERS = [
  { name: 'Students', icon: '👨‍🎓' },
  { name: 'Teachers', icon: '👩‍🏫' },
  { name: 'Professionals', icon: '👨‍💼' },
  { name: 'Developers', icon: '👩‍💻' },
  { name: 'Writers', icon: '✍️' },
  { name: 'Home Users', icon: '👨‍🍳' },
  { name: 'Designers', icon: '🎨' },
  { name: 'Travelers', icon: '🌍' },
  { name: 'Founders', icon: '📈' },
];

function formatDate(ts: number) {
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function NotesList() {
  const { notes, loadNotes, addNote, removeNote, activeFolder, setActiveFolder, setNoteImage, clearNoteImage, markNoteOpened } = useNoteStore();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    pullNotes().then(() => loadNotes());
    loadNotes();
  }, []);

  // "Full text" search: splits the query into words and requires every word
  // to appear somewhere in the title, content, or tags — so "urgent notes"
  // matches a note containing both words anywhere, not just as one phrase.
  const searchWords = search.toLowerCase().trim().split(/\s+/).filter(Boolean);

  const filtered = notes.filter((n) => {
    const haystack = `${n.title} ${n.content} ${n.tags || ''}`.toLowerCase();
    const matchesSearch = searchWords.length === 0 || searchWords.every((w) => haystack.includes(w));
    const matchesFolder = !activeFolder || n.folder === activeFolder;
    return matchesSearch && matchesFolder;
  });

  // The note the action-sheet Modal is currently open for, if any.
  const activeMenuNote = menuOpenId ? filtered.find((n) => n.id === menuOpenId) : null;

  const handleNewNote = () => {
    router.push(`/note/new?folder=${encodeURIComponent(activeFolder || 'General')}`);
  };

  // Tapping a folder chip opens a note pre-titled with that folder name.
  // The + button (handleNewNote) still opens fully blank.
  const handleFolderTap = (folderName: string) => {
    setActiveFolder(folderName);
    router.push(`/note/new?folder=${encodeURIComponent(folderName)}&title=${encodeURIComponent(folderName)}`);
  };

  // Tapping the camera icon opens the device gallery. The picked photo
  // becomes that note card's background image.
  const handlePickImage = async (noteId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to add an image to this note.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setNoteImage(noteId, result.assets[0].uri);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Notes</Text>

      <View style={styles.chipsRow}>
        {FOLDERS.map((f) => (
          <TouchableOpacity
            key={f.name}
            onPress={() => handleFolderTap(f.name)}
            style={[
              styles.chip,
              activeFolder === f.name && styles.chipActive,
            ]}
          >
            <Text style={styles.chipIcon}>{f.icon}</Text>
            <Text style={styles.chipText} numberOfLines={1} adjustsFontSizeToFit>{f.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchBox}>
        <Text style={{ marginRight: 8 }}>🔍</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes"
          style={{ flex: 1 }}
        />
      </View>

      <Text style={styles.countLabel}>
        {activeFolder ? activeFolder : 'All notes'} · {filtered.length}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const CardWrapper: any = item.image_uri ? ImageBackground : View;
          const wrapperProps = item.image_uri
            ? { source: { uri: item.image_uri }, imageStyle: { borderRadius: 16 } }
            : {};
          const folderMeta = FOLDERS.find((f) => f.name === item.folder);

          return (
            <TouchableOpacity
              style={styles.cardTouchable}
              onPress={() => {
                markNoteOpened(item.id);
                router.push(`/note/${item.id}`);
              }}
              onLongPress={() => setMenuOpenId(item.id)}
            >
              <CardWrapper style={styles.card} {...wrapperProps}>
                {item.image_uri && <View style={styles.cardOverlay} />}

                <Text style={[styles.cardDate, item.image_uri && styles.textOnImage]}>
                  {formatDate(item.created_at)}
                </Text>
                <View style={styles.cardTitleRow}>
                  {folderMeta && <Text style={styles.cardTitleIcon}>{folderMeta.icon}</Text>}
                  <Text
                    style={[styles.cardTitle, item.image_uri && styles.textOnImage]}
                    numberOfLines={2}
                  >
                    {item.title || 'Untitled'}
                  </Text>
                </View>
                {!item.image_uri && (
                  <Text style={styles.cardContent} numberOfLines={2}>
                    {item.content}
                  </Text>
                )}
                {item.tags ? (
                  <View style={styles.cardTagsRow}>
                    {item.tags.split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 3).map((tag: string) => (
                      <View key={tag} style={styles.cardTagChip}>
                        <Text style={styles.cardTagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <TouchableOpacity onPress={() => handlePickImage(item.id)}>
                    <View style={styles.cameraButton}>
                      <Text>📷</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {item.has_conflict ? (
                      <View style={[styles.syncBadge, styles.conflictBadge]}>
                        <Text style={styles.syncBadgeText}>⚠ Conflict</Text>
                      </View>
                    ) : (
                      <View style={[
                        styles.syncBadge,
                        item.sync_status === 'synced' ? styles.syncBadgeSynced : styles.syncBadgePending,
                      ]}>
                        <Text style={styles.syncBadgeText}>
                          {item.sync_status === 'synced' ? '✓ Synced' : '⏳ Pending'}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => setMenuOpenId(item.id)}>
                      <View style={[styles.dotsButton, item.image_uri && styles.dotsButtonOnImage]}>
                        <Text style={{ fontSize: 16, color: item.image_uri ? '#fff' : '#555' }}>⋯</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </CardWrapper>
            </TouchableOpacity>
          );
        }}
      />

      {/* Action-sheet menu — a real Modal so it always renders above everything
          reliably, instead of an absolutely-positioned popover fighting for
          z-index against elevation, which was unreliable across Android/iOS. */}
      <Modal
        visible={activeMenuNote != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpenId(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuOpenId(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {activeMenuNote?.title || 'Untitled'}
            </Text>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => {
                if (!activeMenuNote) return;
                const id = activeMenuNote.id;
                setMenuOpenId(null);
                markNoteOpened(id);
                router.push(`/note/${id}`);
              }}
            >
              <Text style={styles.sheetItemText}>✏️  Edit</Text>
            </TouchableOpacity>

            {activeMenuNote?.image_uri ? (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  if (!activeMenuNote) return;
                  const id = activeMenuNote.id;
                  setMenuOpenId(null);
                  clearNoteImage(id);
                }}
              >
                <Text style={styles.sheetItemText}>🚫  Remove Photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => {
                if (!activeMenuNote) return;
                const id = activeMenuNote.id;
                setMenuOpenId(null);
                removeNote(id);
              }}
            >
              <Text style={[styles.sheetItemText, { color: 'red' }]}>🗑️  Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancel} onPress={() => setMenuOpenId(null)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={handleNewNote}>
        <Text style={{ color: 'white', fontSize: 28, lineHeight: 28 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const TEAL = '#0f3c44';
const CHIP_BG = '#dbe7ee';
const CHIP_TEXT = '#16323a';

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#ffffff' },
  header: { fontSize: 32, fontWeight: '800', marginBottom: 16, color: '#16323a' },
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', rowGap: 10, marginBottom: 16,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '32%', paddingVertical: 12, borderRadius: 24,
    backgroundColor: CHIP_BG,
  },
  chipActive: { borderWidth: 2, borderColor: TEAL },
  chipIcon: { fontSize: 14 },
  chipText: { fontWeight: '600', color: CHIP_TEXT, fontSize: 13 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2f4',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  countLabel: { color: '#888', marginBottom: 12 },
  cardTouchable: { flex: 1 },
  card: {
    flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 14,
    minHeight: 150, position: 'relative',
    borderWidth: 1, borderColor: '#e6e6e6',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
  },
  cardDate: { color: '#999', fontSize: 12, marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardTitleIcon: { fontSize: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#16323a' },
  cardContent: { color: '#666', fontSize: 13 },
  cardTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  cardTagChip: { backgroundColor: '#eef2f4', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  cardTagText: { fontSize: 10, color: '#0f3c44', fontWeight: '600' },
  textOnImage: { color: '#fff' },
  cameraButton: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  syncBadgeSynced: { backgroundColor: 'rgba(30,150,90,0.15)' },
  syncBadgePending: { backgroundColor: 'rgba(230,150,20,0.18)' },
  conflictBadge: { backgroundColor: 'rgba(220,50,50,0.18)' },
  syncBadgeText: { fontSize: 10, fontWeight: '700', color: '#333' },
  dotsButton: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  dotsButtonOnImage: { backgroundColor: 'rgba(0,0,0,0.45)' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 14,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 30, paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 13, color: '#999', fontWeight: '600',
    textAlign: 'center', marginBottom: 10,
  },
  sheetItem: {
    paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#eee',
  },
  sheetItemText: { fontSize: 16, color: '#16323a', fontWeight: '500' },
  sheetCancel: {
    paddingVertical: 16, marginTop: 8, backgroundColor: '#f0f0f0',
    borderRadius: 12, alignItems: 'center',
  },
  sheetCancelText: { fontSize: 16, fontWeight: '700', color: '#16323a' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: TEAL, alignItems: 'center',
    justifyContent: 'center', elevation: 6,
  },
});