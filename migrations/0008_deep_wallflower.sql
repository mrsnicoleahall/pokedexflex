CREATE TABLE `user_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`species_id` integer NOT NULL,
	`slot` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorites_user_id_slot_unique` ON `user_favorites` (`user_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorites_user_id_species_id_unique` ON `user_favorites` (`user_id`,`species_id`);