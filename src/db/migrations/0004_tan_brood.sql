ALTER TABLE `food_items` ADD `fiber_per_100g` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredients` ADD `fiber_g` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meals` ADD `total_fiber_g` real DEFAULT 0 NOT NULL;