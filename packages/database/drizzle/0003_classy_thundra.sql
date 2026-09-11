CREATE TABLE `print_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`document_type` text NOT NULL,
	`document_id` text NOT NULL,
	`printer_id` text,
	`context` text NOT NULL,
	`attempted_at` text NOT NULL,
	`success` integer NOT NULL,
	`failure_category` text,
	`failure_message` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "print_attempts_document_type_check" CHECK("print_attempts"."document_type" in ('kitchen_ticket', 'receipt', 'test')),
	CONSTRAINT "print_attempts_context_check" CHECK("print_attempts"."context" in ('initial', 'retry', 'reprint', 'test'))
);
--> statement-breakpoint
CREATE INDEX `print_attempts_business_attempted_idx` ON `print_attempts` (`business_id`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `print_attempts_document_idx` ON `print_attempts` (`document_type`,`document_id`);