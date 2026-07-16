CREATE TABLE `wall_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`wall_user_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wall_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
