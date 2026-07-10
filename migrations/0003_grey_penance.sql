CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`species_id` integer NOT NULL,
	`form_id` integer,
	`year` integer,
	`games` text,
	`region` text,
	`method` text,
	`ot_name` text,
	`ot_id` text,
	`ribbon` text,
	`is_shiny` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);