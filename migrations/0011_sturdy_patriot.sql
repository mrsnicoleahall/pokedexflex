CREATE TABLE `user_wanted` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`species_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_wanted_user_id_species_id_unique` ON `user_wanted` (`user_id`,`species_id`);