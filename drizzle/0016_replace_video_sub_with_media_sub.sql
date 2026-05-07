CREATE TABLE `media_sub` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`file_name` text NOT NULL,
	`relative_path` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'video',
	`cover_path` text,
	`sort_order` integer DEFAULT 0,
	`is_visible` integer DEFAULT 1,
	`has_subtitle` integer DEFAULT 0,
	`duration` integer,
	`bitrate` integer,
	`sample_rate` integer,
	`frame_rate` real,
	`audio_bitrate` integer,
	`audio_sample_rate` integer,
	`width` integer,
	`height` integer,
	`metadata_updated_at` integer,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `media_sub` (
	`id`,
	`resource_id`,
	`file_name`,
	`relative_path`,
	`kind`,
	`cover_path`,
	`sort_order`,
	`is_visible`,
	`has_subtitle`,
	`duration`,
	`bitrate`,
	`sample_rate`,
	`frame_rate`,
	`audio_bitrate`,
	`audio_sample_rate`,
	`width`,
	`height`,
	`metadata_updated_at`
)
SELECT
	`id`,
	`resource_id`,
	`file_name`,
	`relative_path`,
	'video',
	`cover_path`,
	COALESCE(`sort_order`, 0),
	COALESCE(`is_visible`, 1),
	0,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL
FROM `video_sub`;
--> statement-breakpoint
DROP TABLE `video_sub`;
