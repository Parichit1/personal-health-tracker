import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  computeTotals,
  confirmAndSaveMeal,
  parseMealDraft,
  resolveClarificationAnswer,
  resolveWithEstimate,
  type MealDraft,
} from '../../src/logging/logMealPipeline';
import type { MealType } from '../../src/services/ai/AIParsingService';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

export default function LogScreen() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [clarificationInputs, setClarificationInputs] = useState<Record<number, string>>({});
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);

  const hasPendingIngredients = draft?.ingredients.some((ing) => ing.needsClarification) ?? false;

  async function handleParse() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const result = await parseMealDraft(text.trim(), 'typed');
      setDraft(result);
      setClarificationInputs({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await confirmAndSaveMeal(draft);
      setSavedMessage(`Logged: ${draft.name} — ${Math.round(draft.totalCalories)} calories`);
      setDraft(null);
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleDiscard() {
    setDraft(null);
    setError(null);
    setClarificationInputs({});
  }

  function setDraftMealType(mealType: MealType) {
    setDraft((prev) => (prev ? { ...prev, mealType } : prev));
  }

  function replaceIngredient(index: number, resolved: Awaited<ReturnType<typeof resolveWithEstimate>>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const ingredients = [...prev.ingredients];
      ingredients[index] = resolved;
      return { ...prev, ingredients, ...computeTotals(ingredients) };
    });
  }

  async function handleClarificationSubmit(index: number, ing: MealDraft['ingredients'][number]) {
    const answerText = clarificationInputs[index]?.trim();
    if (!answerText) return;
    setResolvingIndex(index);
    setError(null);
    try {
      const resolved = await resolveClarificationAnswer(ing.nameAsLogged, ing.rawOrCooked, answerText);
      replaceIngredient(index, resolved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResolvingIndex(null);
    }
  }

  async function handleEstimateRequest(index: number, ing: MealDraft['ingredients'][number]) {
    setResolvingIndex(index);
    setError(null);
    try {
      const resolved = await resolveWithEstimate(ing.nameAsLogged);
      replaceIngredient(index, resolved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResolvingIndex(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log</Text>

      {!draft && (
        <>
          <TextInput
            style={styles.input}
            placeholder='e.g. "160g chicken breast with 1 tbsp olive oil, 1 onion, 1 tomato, cooked"'
            value={text}
            onChangeText={setText}
            multiline
            editable={!busy}
          />
          <Pressable
            style={[styles.button, (busy || !text.trim()) && styles.buttonDisabled]}
            onPress={handleParse}
            disabled={busy || !text.trim()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Parse</Text>}
          </Pressable>
          {savedMessage && <Text style={styles.successText}>{savedMessage}</Text>}
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {draft && (
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>{draft.name}</Text>

          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((mt) => (
              <Pressable
                key={mt}
                style={[styles.chip, draft.mealType === mt && styles.chipSelected]}
                onPress={() => setDraftMealType(mt)}
              >
                <Text style={[styles.chipText, draft.mealType === mt && styles.chipTextSelected]}>{mt}</Text>
              </Pressable>
            ))}
          </View>

          {draft.ingredients.map((ing, idx) =>
            ing.needsClarification ? (
              <View key={idx} style={styles.clarificationRow}>
                <Text style={styles.ingredientName}>{ing.nameAsLogged}</Text>
                <Text style={styles.clarificationReason}>{ing.resolvedDescription}</Text>
                <TextInput
                  style={styles.clarificationInput}
                  placeholder='e.g. "150g" or "about 40 cal"'
                  value={clarificationInputs[idx] ?? ''}
                  onChangeText={(v) => setClarificationInputs((prev) => ({ ...prev, [idx]: v }))}
                  editable={resolvingIndex !== idx}
                />
                <View style={styles.clarificationActionRow}>
                  <Pressable
                    style={styles.estimateButton}
                    onPress={() => handleEstimateRequest(idx, ing)}
                    disabled={resolvingIndex === idx}
                  >
                    {resolvingIndex === idx ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text style={styles.estimateButtonText}>Estimate for me</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.submitButton,
                      (!clarificationInputs[idx]?.trim() || resolvingIndex === idx) && styles.buttonDisabled,
                    ]}
                    onPress={() => handleClarificationSubmit(idx, ing)}
                    disabled={!clarificationInputs[idx]?.trim() || resolvingIndex === idx}
                  >
                    <Text style={styles.submitButtonText}>Submit</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View key={idx} style={styles.ingredientRow}>
                <Text style={styles.ingredientName}>
                  {ing.quantity != null && ing.unit != null ? `${ing.quantity}${ing.unit} ` : ''}
                  {ing.nameAsLogged}
                  {ing.rawOrCooked !== 'unspecified' ? ` (${ing.rawOrCooked})` : ''}
                </Text>
                <Text style={styles.resolvedDescription}>
                  {ing.isUserStated || ing.isEstimated ? ing.resolvedDescription : `matched: ${ing.resolvedDescription}`}
                  {ing.isApproximateConversion ? ' — approximate conversion' : ''}
                  {ing.fractionEaten !== 1 ? ` — ate ${Math.round(ing.fractionEaten * 100)}% of this` : ''}
                </Text>
                <Text style={styles.macros}>
                  {Math.round(ing.caloriesKcal)} kcal · {Math.round(ing.proteinG)}g protein ·{' '}
                  {Math.round(ing.carbsG)}g carbs · {Math.round(ing.fatG)}g fat · {Math.round(ing.fiberG)}g fiber
                </Text>
              </View>
            ),
          )}

          <View style={styles.totalsBox}>
            <Text style={styles.totalsText}>
              Total: {Math.round(draft.totalCalories)} kcal · {Math.round(draft.totalProteinG)}g protein ·{' '}
              {Math.round(draft.totalCarbsG)}g carbs · {Math.round(draft.totalFatG)}g fat ·{' '}
              {Math.round(draft.totalFiberG)}g fiber
            </Text>
            {hasPendingIngredients && (
              <Text style={styles.pendingNotice}>Resolve every item above before saving.</Text>
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.discardButton} onPress={handleDiscard} disabled={busy}>
              <Text style={styles.discardButtonText}>Discard</Text>
            </Pressable>
            <Pressable
              style={[styles.button, (busy || hasPendingIngredients) && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={busy || hasPendingIngredients}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirm & Save</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  errorText: { color: '#b00020', fontSize: 14 },
  successText: { color: '#1b7a1b', fontSize: 14 },
  previewBox: { gap: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14 },
  previewTitle: { fontSize: 20, fontWeight: '700' },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextSelected: { color: '#fff' },
  ingredientRow: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, gap: 2 },
  ingredientName: { fontSize: 15, fontWeight: '600' },
  resolvedDescription: { fontSize: 12, color: '#666' },
  macros: { fontSize: 13, color: '#333' },
  totalsBox: { borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 10, gap: 4 },
  totalsText: { fontSize: 15, fontWeight: '700' },
  pendingNotice: { fontSize: 12, color: '#b00020' },
  actionRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  discardButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  discardButtonText: { color: '#333', fontWeight: '600' },
  clarificationRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    gap: 8,
    backgroundColor: '#fff8e6',
    marginHorizontal: -14,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  clarificationReason: { fontSize: 12, color: '#8a6d1a' },
  clarificationInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  clarificationActionRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  estimateButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#999',
  },
  estimateButtonText: { fontSize: 13, color: '#333', fontWeight: '600' },
  submitButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  submitButtonText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
