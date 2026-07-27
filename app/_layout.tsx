import 'react-native-get-random-values'; // MUST be the very first import — fixes crypto-js on native

import { Drawer } from 'expo-router/drawer';
import { useEffect, useState } from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDB } from '../db/database';
import { startSyncListener } from '../sync/syncEngine';
import { useNoteStore } from '../store/useNoteStore';

const TEAL = '#0f3c44';

export default function Layout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initDB(); // now async — loads/creates the local encryption key first
      startSyncListener();
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <Drawer
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: TEAL },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        headerTitleAlign: 'center',
      }}
    >
  <Drawer.Screen
    name="index"
    options={{
      drawerLabel: 'All Notes',
      title: '',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => Alert.alert('Settings', 'Settings screen not set up yet.')}
          style={{ marginRight: 16 }}
        >
          <Text style={{ fontSize: 20 }}></Text>
        </TouchableOpacity>
      ),
    }}
    listeners={{
      drawerItemPress: () => {
        useNoteStore.getState().setActiveFolder(null);
      },
    }}
  />
  <Drawer.Screen name="history" options={{ drawerLabel: 'History', headerShown: false }} />
  <Drawer.Screen name="note/[id]" options={{ headerShown: false, drawerItemStyle: { display: 'none' } }} />
  <Drawer.Screen name="modal" options={{ drawerItemStyle: { display: 'none' } }} />
  <Drawer.Screen name="+not-found" options={{ drawerItemStyle: { display: 'none' } }} />
</Drawer>
    </GestureHandlerRootView>
  );
}