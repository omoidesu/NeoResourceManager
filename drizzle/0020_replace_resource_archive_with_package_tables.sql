CREATE TABLE IF NOT EXISTS `archive_package` (
  `id` text PRIMARY KEY NOT NULL,
  `package_title` text NOT NULL,
  `archive_path` text NOT NULL,
  `archive_format` text NOT NULL,
  `archive_level` integer DEFAULT 9,
  `password_enabled` integer DEFAULT 0,
  `archive_password` text,
  `split_size_mb` integer,
  `multithread_enabled` integer DEFAULT 0,
  `thread_count` integer,
  `source_total_size` integer,
  `archive_size` integer,
  `resource_count` integer DEFAULT 1,
  `status` text DEFAULT 'completed',
  `archived_at` integer DEFAULT (strftime('%s', 'now')),
  `is_deleted` integer DEFAULT 0
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `archive_package_item` (
  `id` text PRIMARY KEY NOT NULL,
  `package_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `archive_entry_path` text NOT NULL,
  `source_path` text NOT NULL,
  `source_size` integer,
  `sort_order` integer DEFAULT 0,
  `is_deleted` integer DEFAULT 0,
  FOREIGN KEY (`package_id`) REFERENCES `archive_package`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `idx_archive_package_path` ON `archive_package` (`archive_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_archive_package_archived_at` ON `archive_package` (`archived_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_archive_package_item_package_id` ON `archive_package_item` (`package_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_archive_package_item_resource_id` ON `archive_package_item` (`resource_id`);
