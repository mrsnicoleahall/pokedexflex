CREATE TABLE `rivalries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`opponent_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rivalries_user_id_opponent_user_id_unique` ON `rivalries` (`user_id`,`opponent_user_id`);