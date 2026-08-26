/**
 * Interface only — no implementation until Phase 2 (ClaudeDirectAdapter).
 * The app's logging pipeline depends only on this type, never on a concrete
 * adapter, so the backing implementation can change later without touching
 * call sites.
 */

export interface ParseContext {
  [key: string]: unknown;
}

export interface ParseResult {
  mode: 'A' | 'B' | 'C';
  raw: unknown;
}

export interface AIParsingService {
  parseMeal(text: string, context: ParseContext): Promise<ParseResult>;
  parseWorkout(text: string, context: ParseContext): Promise<ParseResult>;
}
