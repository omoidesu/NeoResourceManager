CREATE TABLE `actor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` text NOT NULL,
	`name` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asmr_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`cv` text,
	`language` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `author` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_deleted` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `author_work` (
	`author_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`category_id` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`reference_id` text,
	`sort` integer,
	`is_deleted` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `dict_data` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`value` text NOT NULL,
	`extra` text,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`type_id`) REFERENCES `dict_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dict_type` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`is_deleted` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `game_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`name_zh` text,
	`name_en` text,
	`name_jp` text,
	`nickname` text,
	`engine` text,
	`version` text,
	`language` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `multi_image_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`page_count` integer,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `novel_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`translator` text,
	`publisher` text,
	`year` integer DEFAULT -1,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resource` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category_id` text NOT NULL,
	`cover_path` text,
	`description` text,
	`base_path` text NOT NULL,
	`fileName` text,
	`if_favorite` integer DEFAULT false,
	`is_completed` integer DEFAULT false,
	`rating` real DEFAULT -1,
	`size` integer,
	`missing_status` integer DEFAULT false,
	`r18` integer DEFAULT false,
	`create_time` integer DEFAULT (strftime('%s', 'now')),
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resource_log` (
	`resource_id` text,
	`start_time` integer,
	`end_time` integer,
	`duration` integer DEFAULT 0,
	`pid` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resource_stat` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`first_access_time` integer,
	`last_access_time` integer,
	`access_count` integer DEFAULT 0,
	`total_runtime` integer DEFAULT 0,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resource_type` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`value` text NOT NULL,
	`locked` integer DEFAULT false,
	`is_deleted` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `single_image_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`resolution` text,
	`format` text,
	`source` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `software_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`version` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `store_work` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` text NOT NULL,
	`store_id` text NOT NULL,
	`work_id` text,
	`url` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `dict_data`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tag_resource` (
	`resource_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`resource_id`, `tag_id`),
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `type_resource` (
	`resource_id` text NOT NULL,
	`type_id` text NOT NULL,
	PRIMARY KEY(`resource_id`, `type_id`),
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `resource_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `video_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`year` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `website_meta` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`favicon` text,
	FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
