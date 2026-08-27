import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';

import { MealParseSchema } from '../../ai/mealParseSchema';
import type { AIParsingService, ParseContext, ParsedMeal } from './AIParsingService';

/**
 * Calls OpenAI directly from the client (no backend proxy) — the accepted
 * Phase 2 tradeoff for a personal single-user app. The key is embedded in
 * the client bundle via EXPO_PUBLIC_OPENAI_API_KEY; never commit .env.
 *
 * Uses gpt-5-mini (cost-effective tier) for this single-call structured
 * extraction task — reliable enough for parsing quantities/units correctly
 * without paying for a full reasoning-tier model, per the product spec's
 * two-tier model design (cheap/fast for routine parsing).
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
}
