import { StyleSheet, Text, View } from 'react-native';

export default function FoodMemoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Food Memory</Text>
      <Text style={styles.subtitle}>
        What the system has learned about your usual foods and recipes arrives in Phase 6.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#666' },
});
