import { Stack } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { db } from '../src/db/client';
import migrations from '../src/db/migrations/migrations';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Database migration failed:</Text>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Setting up database…</Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
});
