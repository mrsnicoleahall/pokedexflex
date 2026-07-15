ALTER TABLE `users` ADD `handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `is_public` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);