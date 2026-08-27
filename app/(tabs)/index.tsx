import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getAppMetaValue, setAppMetaValue } from '../../src/db/appMetaStore';
import { clearAllFoodItems } from '../../src/db/repositories/foodItems.repo';
import { getMealsForDate } from '../../src/db/repositories/meals.repo';
import { getDailyTargets, setDailyTargets, type DailyTargets } from '../../src/db/repositories/targets.repo';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const EMPTY_TOTALS: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const EMPTY_TARGETS: DailyTargets = { calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null };

function MetricRow({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  return (
    <Text style={styles.statsLine}>
      {label}: {Math.round(value)}
      {unit}
      {target != null ? ` / ${Math.round(target)}${unit}` : ''}
    </Text>
  );
}

export default function TodayScreen() {
  const [dbStatus, setDbStatus] = useState('Checking database…');
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [mealCount, setMealCount] = useState(0);
  const [targets, setTargets] = useState<DailyTargets>(EMPTY_TARGETS);
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [cacheClearedMessage, setCacheClearedMessage] = useState<string | null>(null);
  const [targetDrafts, setTargetDrafts] = useState<Record<keyof DailyTargets, string>>({
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const now = new Date().toISOString();
          await setAppMetaValue('last_opened_at', now);
          const readBack = await getAppMetaValue('last_opened_at');
          if (!cancelled) {
            setDbStatus(
              readBack === now
                ? `DB OK — wrote and read back last_opened_at: ${readBack}`
                : 'DB check failed: value read back did not match what was written.',
            );
          }
        } catch (err) {
          if (!cancelled) setDbStatus(`DB check failed: ${(err as Error).message}`);
        }

        try {
          const todaysMeals = await getMealsForDate(todayDateString());
          if (cancelled) return;
          setMealCount(todaysMeals.length);
          setTotals(
            todaysMeals.reduce<Totals>(
              (acc, m) => ({
                calories: acc.calories + m.totalCalories,
                protein: acc.protein + m.totalProteinG,
                carbs: acc.carbs + m.totalCarbsG,
                fat: acc.fat + m.totalFatG,
                fiber: acc.fiber + m.totalFiberG,
              }),
              EMPTY_TOTALS,
            ),
          );
        } catch {
          // Leave totals as-is — the DB sanity check above already surfaces real DB problems.
        }

        try {
          const loadedTargets = await getDailyTargets();
          if (cancelled) return;
          setTargets(loadedTargets);
          setTargetDrafts({
            calories: loadedTargets.calories?.toString() ?? '',
            proteinG: loadedTargets.proteinG?.toString() ?? '',
            carbsG: loadedTargets.carbsG?.toString() ?? '',
            fatG: loadedTargets.fatG?.toString() ?? '',
            fiberG: loadedTargets.fiberG?.toString() ?? '',
          });
        } catch {
          // Targets are optional — leave them unset rather than blocking the rest of the screen.
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function handleSaveTargets() {
    const parsed: DailyTargets = {
      calories: targetDrafts.calories.trim() ? Number(targetDrafts.calories) : null,
      proteinG: targetDrafts.proteinG.trim() ? Number(targetDrafts.proteinG) : null,
      carbsG: targetDrafts.carbsG.trim() ? Number(targetDrafts.carbsG) : null,
      fatG: targetDrafts.fatG.trim() ? Number(targetDrafts.fatG) : null,
      fiberG: targetDrafts.fiberG.trim() ? Number(targetDrafts.fiberG) : null,
    };
    await setDailyTargets(parsed);
    setTargets(parsed);
    setIsEditingTargets(false);
  }

  async function handleClearFoodCache() {
    try {
      await clearAllFoodItems();
      setCacheClearedMessage('Food match cache cleared — next log will re-look-up everything fresh.');
    } catch (err) {
      setCacheClearedMessage(`Failed to clear cache: ${(err as Error).message}`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today</Text>

      <View style={styles.statsBox}>
        <Text style={styles.statsHeading}>
          {mealCount} meal{mealCount === 1 ? '' : 's'} logged today
        </Text>
        <Text style={styles.statsCalories}>
          {Math.round(totals.calories)}
          {targets.calories != null ? ` / ${Math.round(targets.calories)}` : ''} kcal
        </Text>
        <MetricRow label="Protein" value={totals.protein} target={targets.proteinG} unit="g" />
        <MetricRow label="Carbs" value={totals.carbs} target={targets.carbsG} unit="g" />
        <MetricRow label="Fat" value={totals.fat} target={targets.fatG} unit="g" />
        <MetricRow label="Fiber" value={totals.fiber} target={targets.fiberG} unit="g" />
      </View>

      {!isEditingTargets && (
        <Pressable onPress={() => setIsEditingTargets(true)}>
          <Text style={styles.editTargetsLink}>Edit daily targets</Text>
        </Pressable>
      )}

      {isEditingTargets && (
        <View style={styles.editBox}>
          <Text style={styles.editBoxTitle}>Daily targets</Text>
          {(
            [
              ['calories', 'Calories'],
              ['proteinG', 'Protein (g)'],
              ['carbsG', 'Carbs (g)'],
              ['fatG', 'Fat (g)'],
              ['fiberG', 'Fiber (g)'],
            ] as [keyof DailyTargets, string][]
          ).map(([field, label]) => (
            <View key={field} style={styles.editRow}>
              <Text style={styles.editLabel}>{label}</Text>
              <TextInput
                style={styles.editInput}
                keyboardType="numeric"
                value={targetDrafts[field]}
                onChangeText={(text) => setTargetDrafts((prev) => ({ ...prev, [field]: text }))}
                placeholder="none"
              />
            </View>
          ))}
          <View style={styles.editActionRow}>
            <Pressable style={styles.cancelButton} onPress={() => setIsEditingTargets(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSaveTargets}>
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.subtitle}>Steps and workout status will live here in later phases.</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Database sanity check</Text>
        <Text style={styles.statusText}>{dbStatus}</Text>
      </View>

      <Pressable style={styles.clearCacheButton} onPress={handleClearFoodCache}>
        <Text style={styles.clearCacheButtonText}>Clear cached food matches</Text>
      </Pressable>
      {cacheClearedMessage && <Text style={styles.clearCacheMessage}>{cacheClearedMessage}</Text>}
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
  statsBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#111',
    gap: 4,
  },
  statsHeading: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#aaa',
  },
  statsCalories: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  statsLine: {
    fontSize: 14,
    color: '#ddd',
  },
  editTargetsLink: {
    fontSize: 14,
    color: '#0066cc',
    fontWeight: '600',
  },
  clearCacheButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#999',
    alignSelf: 'flex-start',
  },
  clearCacheButtonText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  clearCacheMessage: {
    fontSize: 12,
    color: '#666',
  },
  editBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 10,
  },
  editBoxTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editLabel: {
    fontSize: 14,
    color: '#333',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: 100,
    textAlign: 'right',
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statusBox: {
    marginTop: 12,
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
