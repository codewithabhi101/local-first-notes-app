import { View, FlatList, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useNoteStore } from '../store/useNoteStore';

const TEAL = '#0f3c44';

function formatDate(ts: number) {
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function History() {
  const { history, loadHistory, clearHistory, markNoteOpened } = useNoteStore();
  const router = useRouter();

  useEffect(() => {
    loadHistory();
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleClear = () => {
    if (history.length === 0) return;
    Alert.alert(
      'Delete ALL notes?',
      `This will permanently delete all ${history.length} of your notes. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation since this is irreversible and destroys everything.
            Alert.alert(
              'Are you absolutely sure?',
              'All your notes, folders, and photos will be gone permanently.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete everything', style: 'destructive', onPress: () => clearHistory() },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ color: '#999' }}>No recently opened notes yet.</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }: any) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                markNoteOpened(item.id);
                router.push(`/note/${item.id}`);
              }}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title || 'Untitled'}</Text>
              <Text style={styles.rowDate}>{formatDate(item.last_opened_at)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: TEAL, paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
  },
  backButton: { width: 70 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  clearButton: { width: 70, alignItems: 'flex-end' },
  clearText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    backgroundColor: '#f5f4f0', borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#16323a', flex: 1, marginRight: 12 },
  rowDate: { fontSize: 12, color: '#999' },
});