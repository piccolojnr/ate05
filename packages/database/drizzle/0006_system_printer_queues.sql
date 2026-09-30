-- Save history links before DROP TABLE triggers ON DELETE SET NULL.
-- This works with foreign keys enabled, including inside SQLx transactions.
CREATE TABLE `__printer_history_links` AS SELECT `id`, `printer_id` FROM `print_attempts` WHERE `printer_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `__new_printers` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `name` text NOT NULL,
  `role` text NOT NULL,
  `connection_type` text NOT NULL,
  `address` text NOT NULL,
  `queue_name` text,
  `port` integer,
  `paper_width` integer DEFAULT 80 NOT NULL,
  `cutter_enabled` integer DEFAULT true NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `printers_role_check` CHECK (`role` in ('kitchen', 'receipt')),
  CONSTRAINT `printers_connection_type_check` CHECK (`connection_type` in ('network', 'usb', 'system')),
  CONSTRAINT `printers_system_queue_check` CHECK (`connection_type` != 'system' or (`queue_name` is not null and length(trim(`queue_name`)) > 0 and `address` = '' and `port` is null)),
  CONSTRAINT `printers_paper_width_check` CHECK (`paper_width` in (58, 80)),
  CONSTRAINT `printers_port_check` CHECK (`port` is null or (`port` > 0 and `port` < 65536))
);
--> statement-breakpoint
INSERT INTO `__new_printers` (`id`, `business_id`, `name`, `role`, `connection_type`, `address`, `port`, `paper_width`, `cutter_enabled`, `active`, `created_at`, `updated_at`)
SELECT `id`, `business_id`, `name`, `role`, `connection_type`, `address`, `port`, `paper_width`, `cutter_enabled`, `active`, `created_at`, `updated_at` FROM `printers`;
--> statement-breakpoint
DROP TABLE `printers`;
--> statement-breakpoint
ALTER TABLE `__new_printers` RENAME TO `printers`;
--> statement-breakpoint
CREATE INDEX `printers_business_role_idx` ON `printers` (`business_id`, `role`);
--> statement-breakpoint
UPDATE `print_attempts` SET `printer_id` = (SELECT `printer_id` FROM `__printer_history_links` WHERE `id` = `print_attempts`.`id`) WHERE `id` IN (SELECT `id` FROM `__printer_history_links`);
--> statement-breakpoint
DROP TABLE `__printer_history_links`;
