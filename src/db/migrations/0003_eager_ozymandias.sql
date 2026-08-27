PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`food_item_id` integer,
	`name_as_logged` text NOT NULL,
	`quantity` real,
	`unit` text,
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
INSERT INTO `__new_ingredients`("id", "meal_id", "food_item_id", "name_as_logged", "quantity", "unit", "raw_or_cooked", "calories_kcal", "protein_g", "carbs_g", "fat_g", "created_at") SELECT "id", "meal_id", "food_item_id", "name_as_logged", "quantity", "unit", "raw_or_cooked", "calories_kcal", "protein_g", "carbs_g", "fat_g", "created_at" FROM `ingredients`;--> statement-breakpoint
DROP TABLE `ingredients`;--> statement-breakpoint
ALTER TABLE `__new_ingredients` RENAME TO `ingredients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;