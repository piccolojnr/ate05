ALTER TABLE `payments` ADD `cash_tendered_minor` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `change_minor` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_business_id_idempotency_unique` ON `payments` (`business_id`,`idempotency_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`receipt_number` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`payment_summary` text NOT NULL,
	`snapshot` text NOT NULL,
	`print_status` text DEFAULT 'pending' NOT NULL,
	`printed_at` text,
	`last_print_error` text,
	`print_attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`issued_at` text NOT NULL,
	`issued_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "receipts_number_positive" CHECK("__new_receipts"."receipt_number" > 0),
	CONSTRAINT "receipts_total_nonnegative" CHECK("__new_receipts"."total_minor" >= 0),
	CONSTRAINT "receipts_print_status_check" CHECK("__new_receipts"."print_status" in ('pending', 'printed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_receipts`("id", "business_id", "order_id", "receipt_number", "total_minor", "payment_summary", "snapshot", "print_status", "printed_at", "last_print_error", "print_attempt_count", "last_attempt_at", "issued_at", "issued_by", "created_at") SELECT "id", "business_id", "order_id", "receipt_number", "total_minor", "payment_summary", '', 'pending', NULL, NULL, 0, NULL, "issued_at", "issued_by", "created_at" FROM `receipts`;--> statement-breakpoint
DROP TABLE `receipts`;--> statement-breakpoint
ALTER TABLE `__new_receipts` RENAME TO `receipts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `receipts_business_id_idx` ON `receipts` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_business_number_unique` ON `receipts` (`business_id`,`receipt_number`);
