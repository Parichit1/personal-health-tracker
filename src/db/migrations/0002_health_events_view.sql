-- Cross-domain chronological timeline, kept as a VIEW (not a stored table) so
-- adding a new domain later (steps, workouts, weight) is just re-creating this
-- view with another UNION ALL branch — no changes to the underlying tables.
DROP VIEW IF EXISTS health_events;
--> statement-breakpoint
CREATE VIEW health_events AS
SELECT
  id,
  'meal' AS event_type,
  meal_date AS event_date,
  logged_at AS event_time,
  name AS summary,
  total_calories AS primary_value
FROM meals;
