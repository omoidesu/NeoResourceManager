CREATE TABLE `video_sub` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_id` text NOT NULL,
  `file_name` text NOT NULL,
  `relative_path` text NOT NULL,
  `sort_order` integer DEFAULT 0,
  `is_visible` integer DEFAULT 1,
  `cover_path` text,
  FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
