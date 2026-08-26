import { StyleSheet, Text, View } from 'react-native';

export default function LogScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log</Text>
      <Text style={styles.subtitle}>
        Typed and voice natural-language logging for meals and workouts arrives in Phase 2/3.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#666' },
});
