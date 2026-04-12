CREATE TABLE `audio_meta` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES resource(id),
	`artist` text,
	`album` text,
	`duration` integer,
	`last_play_time` integer DEFAULT 0
);
