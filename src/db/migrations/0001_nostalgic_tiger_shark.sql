CREATE TABLE `food_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`description` text NOT NULL,
	`brand` text,
	`data_type` text,
	`calories_per_100g` real NOT NULL,
	`protein_per_100g` real NOT NULL,
	`carbs_per_100g` real NOT NULL,
	`fat_per_100g` real NOT NULL,
	`raw_or_cooked` text NOT NULL,
	`last_fetched_at` text NOT NULL,
	`matched_queries` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`food_item_id` integer,
	`name_as_logged` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`raw_or_cooked` text NOT NULL,
	`calories_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_item_id`) REFERENCES `food_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logged_at` text NOT NULL,
	`meal_date` text NOT NULL,
	`meal_type` text NOT NULL,
	`name` text NOT NULL,
	`input_mode` text NOT NULL,
	`source_text` text NOT NULL,
	`input_method` text NOT NULL,
	`recipe_id` integer,
	`total_calories` real NOT NULL,
	`total_protein_g` real NOT NULL,
	`total_carbs_g` real NOT NULL,
	`total_fat_g` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`name_aliases` text DEFAULT '[]' NOT NULL,
	`last_logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_normalized_name_unique` ON `recipes` (`normalized_name`);