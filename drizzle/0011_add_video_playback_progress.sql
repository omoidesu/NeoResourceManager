ALTER TABLE `video_meta` ADD `last_play_file` text;
--> statement-breakpoint
ALTER TABLE `video_meta` ADD `last_play_time` integer DEFAULT 0;
