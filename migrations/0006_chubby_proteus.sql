CREATE TABLE `user_ribbons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ribbon_id` text NOT NULL,
	`earned_at` integer NOT NULL,
	`seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_ribbons_user_id_ribbon_id_unique` ON `user_ribbons` (`user_id`,`ribbon_id`);--> statement-breakpoint
CREATE TABLE `user_showcase` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ribbon_id` text NOT NULL,
	`slot` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_showcase_user_id_slot_unique` ON `user_showcase` (`user_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_showcase_user_id_ribbon_id_unique` ON `user_showcase` (`user_id`,`ribbon_id`);