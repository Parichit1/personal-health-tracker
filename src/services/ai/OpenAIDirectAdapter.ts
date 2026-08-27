import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';

import {
  ClarificationAnswerSchema,
  MealParseSchema,
  NutritionEstimateSchema,
} from '../../ai/mealParseSchema';
import type { AIParsingService, NutritionEstimate, ParseContext, ParsedIngredient, ParsedMeal } from './AIParsingService';

/**
 * Calls OpenAI directly from the client (no backend proxy) — the accepted
 * Phase 2 tradeoff for a personal single-user app. The key is embedded in
 * the client bundle via EXPO_PUBLIC_OPENAI_API_KEY; never commit .env.
 *
 * Uses gpt-5-mini (cost-effective tier) for these single-call structured
 * tasks — reliable enough without paying for a full reasoning-tier model,
 * per the product spec's two-tier model design (cheap/fast for routine
 * parsing).
 */
export class OpenAIDirectAdapter implements AIParsingService {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  async parseMeal(text: string, context: ParseContext): Promise<ParsedMeal> {
    const response = await this.client.chat.completions.parse({
      model: 'gpt-5-mini',
      // This is a narrow, well-specified extraction task, not open-ended
      // reasoning — 'minimal' avoids GPT-5's default extra "thinking" time,
      // which was making every log take noticeably long to come back.
      reasoning_effort: 'minimal',
      messages: [
        {
          role: 'system',
          content:
            'You extract structured meal-logging data from natural language. ' +
            'Extract ONLY what the user explicitly stated — every ingredient/item and its exact quantity or stated nutrition. ' +
            'Never invent, assume, or add an ingredient, quantity, or nutrition value that was not stated. ' +
            'Each ingredient is either "measured" (the user gave a weighable/countable amount like "160g", "2 cups", ' +
            '"1 piece" — set quantity/unit, leave statedCalories/statedProteinG/statedCarbsG/statedFatG/statedFiberG null) or ' +
            '"stated" (the user directly gave calories and/or macros instead of an amount, e.g. "a coffee, about ' +
            '130 cal, 10g protein" — set statedCalories (and any of statedProteinG/statedCarbsG/statedFatG/statedFiberG that were ' +
            'mentioned), leave quantity/unit null). Use "stated" whenever there is no measurable amount to look up, ' +
            'even if a rough item name like "a coffee" or "a protein bar" is given. ' +
            'If an ingredient has neither a measurable quantity nor any stated nutrition value at all, still emit it ' +
            'with mode "stated" and all stated* fields null — do not omit it and do not invent a value for it. ' +
            'fractionEaten is 1 for every ingredient unless the user explicitly said they did not eat all of it. ' +
            'Disambiguation rule: if the "only ate part of it" phrase does NOT name a specific ingredient (e.g. ' +
            '"1 cup rice with 200g chicken, I only ate half of it" — "it" names nothing specific), apply the ' +
            'fraction to EVERY ingredient in the meal equally, not just the last one mentioned. Only apply it to a ' +
            'single ingredient when that ingredient is explicitly named in the fraction phrase itself (e.g. "200g ' +
            'rice with 300g chicken breast, but only had half the chicken" -> chicken=0.5, rice=1). ' +
            'Normalize obvious unit shorthand to a standard form (e.g. "Tbs"/"tbsp."/"tblsp" -> "tbsp", ' +
            '"tsp."/"tspn" -> "tsp", "oz."/"ozs" -> "oz", "lbs."/"lb." -> "lb") without changing the stated quantity. ' +
            `The message is being logged at ${context.loggedAt}; use that to infer meal type only if the user did not say it.`,
        },
        { role: 'user', content: text },
      ],
      response_format: zodResponseFormat(MealParseSchema, 'meal_parse'),
    });

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      throw new Error(`Model refused to parse this meal: ${message.refusal}`);
    }
    if (!message?.parsed) {
      throw new Error('OpenAI did not return a parseable structured meal — try rephrasing.');
    }

    return message.parsed;
  }

  async parseClarification(itemName: string, answerText: string): Promise<ParsedIngredient> {
    const response = await this.client.chat.completions.parse({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [
        {
          role: 'system',
          content:
            `The user previously mentioned "${itemName}" without enough detail to log it. ` +
            'They are now answering a follow-up question about it. Extract ONLY what they explicitly stated in ' +
            'this answer — either a measurable quantity+unit ("measured" mode) or directly-stated calories/macros ' +
            '("stated" mode). fractionEaten is 1 unless they mention eating only part of it. Never invent a value ' +
            'they did not give.',
        },
        { role: 'user', content: answerText },
      ],
      response_format: zodResponseFormat(ClarificationAnswerSchema, 'clarification_answer'),
    });

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      throw new Error(`Model refused to parse this answer: ${message.refusal}`);
    }
    if (!message?.parsed) {
      throw new Error('OpenAI did not return a parseable answer — try rephrasing.');
    }

    return { ...message.parsed, name: itemName };
  }

  async estimateNutrition(itemName: string): Promise<NutritionEstimate> {
    const response = await this.client.chat.completions.parse({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [
        {
          role: 'system',
          content:
            `The user explicitly asked you to estimate typical nutrition for "${itemName}" because they don't know ` +
            'the exact amount or calories themselves. Give one single reasonable estimate for a normal/typical ' +
            'serving as commonly used in home cooking. This is explicitly an estimate, not a lookup.',
        },
        { role: 'user', content: itemName },
      ],
      response_format: zodResponseFormat(NutritionEstimateSchema, 'nutrition_estimate'),
    });

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      throw new Error(`Model refused to estimate this: ${message.refusal}`);
    }
    if (!message?.parsed) {
      throw new Error('OpenAI did not return a parseable estimate — try again.');
    }

    return message.parsed;
  }
}
