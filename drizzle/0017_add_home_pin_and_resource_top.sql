ALTER TABLE `resource` ADD `if_top` integer DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `home_pin` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`pinned_at` integer DEFAULT (strftime('%s', 'now')),
	`is_deleted` integer DEFAULT 0,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
