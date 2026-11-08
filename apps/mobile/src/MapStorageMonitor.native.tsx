import React, { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { configuredMaps } from './native-map-sdk';
import { checkNativeStorage } from './native-storage-space';
import { MAP_STORAGE_RESERVE } from './storage-space';
import { monitorMapStorage } from './map-storage-monitor';
import { s } from './ui';

export default function MapStorageMonitor() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const manager = configuredMaps?.offlineManager;
    if (!manager) return;
    let disposed = false;
    let running = false;
    let generation = 0;
    const sweep = async () => {
      if (disposed || running || AppState.currentState !== 'active') return;
      running = true;
      const ticket = generation;
      const active = () => !disposed && ticket === generation && AppState.currentState === 'active';
      try {
        const result = await monitorMapStorage(manager, () => checkNativeStorage(MAP_STORAGE_RESERVE), active);
        if (active()) setMessage(result);
      } catch {
        if (active()) setMessage('Map download storage monitoring is unavailable. Check free space and pause downloads in Map downloads.');
      } finally { running = false; }
    };
    const timer = setInterval(() => { void sweep(); }, 5000);
    const listener = AppState.addEventListener('change', () => { generation++; void sweep(); });
    void sweep();
    return () => { disposed = true; generation++; clearInterval(timer); listener.remove(); };
  }, []);
  return message ? <Text accessibilityRole="alert" style={s.bodySmall}>{message}</Text> : null;
}
