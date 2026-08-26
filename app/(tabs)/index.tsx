import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getAppMetaValue, setAppMetaValue } from '../../src/db/appMetaStore';

export default function TodayScreen() {
  const [status, setStatus] = useState('Checking database…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const now = new Date().toISOString();
        await setAppMetaValue('last_opened_at', now);
        const readBack = await getAppMetaValue('last_opened_at');

        if (cancelled) return;

        if (readBack === now) {
          setStatus(`DB OK — wrote and read back last_opened_at: ${readBack}`);
        } else {
          setStatus('DB check failed: value read back did not match what was written.');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(`DB check failed: ${(err as Error).message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.subtitle}>Calories, protein, steps, and workout status will live here.</Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Database sanity check</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  statusBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
    gap: 6,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#888',
  },
  statusText: {
    fontSize: 15,
  },
});
