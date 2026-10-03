CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`expense_date` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`payment_method` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expenses_amount_positive" CHECK(typeof("expenses"."amount_minor") = 'integer' and "expenses"."amount_minor" > 0 and "expenses"."amount_minor" <= 9007199254740991),
	CONSTRAINT "expenses_category_valid" CHECK("expenses"."category" in ('Ingredients', 'Utilities', 'Transport', 'Wages', 'Maintenance', 'Rent', 'Other')),
	CONSTRAINT "expenses_payment_method_valid" CHECK("expenses"."payment_method" in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
	CONSTRAINT "expenses_description_valid" CHECK(length(trim("expenses"."description")) between 1 and 240),
	CONSTRAINT "expenses_version_positive" CHECK("expenses"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_business_date_idx` ON `expenses` (`business_id`,`expense_date`);