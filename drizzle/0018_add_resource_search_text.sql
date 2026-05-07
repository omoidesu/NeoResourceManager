ALTER TABLE `resource` ADD `search_text` text;
--> statement-breakpoint
UPDATE `resource`
SET `search_text` = trim(
  coalesce(`resource`.`title`, '') || ' ' ||
  coalesce(`resource`.`description`, '') || ' ' ||
  coalesce((
    SELECT `category`.`name`
    FROM `category`
    WHERE `category`.`id` = `resource`.`category_id`
  ), '') || ' ' ||
  coalesce((
    SELECT group_concat(`tag`.`name`, ' ')
    FROM `tag_resource`
    INNER JOIN `tag` ON `tag`.`id` = `tag_resource`.`tag_id`
    WHERE `tag_resource`.`resource_id` = `resource`.`id`
      AND coalesce(`tag`.`is_deleted`, 0) = 0
  ), '') || ' ' ||
  coalesce((
    SELECT group_concat(`resource_type`.`name`, ' ')
    FROM `type_resource`
    INNER JOIN `resource_type` ON `resource_type`.`id` = `type_resource`.`type_id`
    WHERE `type_resource`.`resource_id` = `resource`.`id`
      AND coalesce(`resource_type`.`is_deleted`, 0) = 0
  ), '') || ' ' ||
  coalesce((
    SELECT group_concat(`author`.`name`, ' ')
    FROM `author_work`
    INNER JOIN `author` ON `author`.`id` = `author_work`.`author_id`
    WHERE `author_work`.`resource_id` = `resource`.`id`
      AND coalesce(`author_work`.`is_deleted`, 0) = 0
      AND coalesce(`author`.`is_deleted`, 0) = 0
  ), '') || ' ' ||
  coalesce((
    SELECT group_concat(`actor`.`name`, ' ')
    FROM `actor`
    WHERE `actor`.`resource_id` = `resource`.`id`
      AND coalesce(`actor`.`is_deleted`, 0) = 0
  ), '') || ' ' ||
  coalesce((
    SELECT group_concat(`store_work`.`work_id`, ' ')
    FROM `store_work`
    WHERE `store_work`.`resource_id` = `resource`.`id`
      AND coalesce(`store_work`.`is_deleted`, 0) = 0
  ), '') || ' ' ||
  coalesce((SELECT `game_meta`.`name_zh` FROM `game_meta` WHERE `game_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `game_meta`.`name_jp` FROM `game_meta` WHERE `game_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `game_meta`.`name_en` FROM `game_meta` WHERE `game_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `game_meta`.`nickname` FROM `game_meta` WHERE `game_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `audio_meta`.`artist` FROM `audio_meta` WHERE `audio_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `audio_meta`.`album` FROM `audio_meta` WHERE `audio_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `asmr_meta`.`cv` FROM `asmr_meta` WHERE `asmr_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `asmr_meta`.`scenario` FROM `asmr_meta` WHERE `asmr_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `asmr_meta`.`illust` FROM `asmr_meta` WHERE `asmr_meta`.`resource_id` = `resource`.`id`), '') || ' ' ||
  coalesce((SELECT `website_meta`.`url` FROM `website_meta` WHERE `website_meta`.`resource_id` = `resource`.`id`), '')
)
WHERE coalesce(`resource`.`is_deleted`, 0) = 0;
