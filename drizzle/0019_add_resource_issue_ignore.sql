CREATE TABLE IF NOT EXISTS `resource_issue_ignore` (
  `resource_id` text NOT NULL,
  `issue_type` text NOT NULL,
  `ignored_at` integer DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (`resource_id`, `issue_type`),
  FOREIGN KEY (`resource_id`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
