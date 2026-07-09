CREATE TABLE `forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`species_id` integer NOT NULL,
	`name` text NOT NULL,
	`form_type` text NOT NULL,
	`sprite_url` text,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `species` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`generation` integer NOT NULL,
	`types` text NOT NULL,
	`sprite_url` text
);
