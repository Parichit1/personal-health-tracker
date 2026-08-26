/**
 * Interface only — no implementation until Phase 4 (ManualActivityAdapter,
 * then HealthKitAdapter in 4b, both implementing this same interface).
 */

export interface DailySteps {
  date: string; // YYYY-MM-DD
  count: number;
  distanceMeters?: number;
  activeCalories?: number;
}

export interface ActivityDataSource {
  getStepsForDate(date: string): Promise<DailySteps | null>;
  getStepsRange(fromDate: string, toDate: string): Promise<DailySteps[]>;
}
