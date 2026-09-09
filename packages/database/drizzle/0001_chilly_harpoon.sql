CREATE TABLE `printers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`connection_type` text NOT NULL,
	`address` text NOT NULL,
	`port` integer,
	`paper_width` integer DEFAULT 80 NOT NULL,
	`cutter_enabled` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "printers_role_check" CHECK("printers"."role" in ('kitchen', 'receipt')),
	CONSTRAINT "printers_connection_type_check" CHECK("printers"."connection_type" in ('network', 'usb')),
	CONSTRAINT "printers_paper_width_check" CHECK("printers"."paper_width" in (58, 80)),
	CONSTRAINT "printers_port_check" CHECK("printers"."port" is null or ("printers"."port" > 0 and "printers"."port" < 65536))
);
--> statement-breakpoint
CREATE INDEX `printers_business_role_idx` ON `printers` (`business_id`,`role`);--> statement-breakpoint
ALTER TABLE `kitchen_tickets` ADD `last_print_error` text;--> statement-breakpoint
ALTER TABLE `kitchen_tickets` ADD `print_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `kitchen_tickets` ADD `last_attempt_at` text;