CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`current_quantity` integer DEFAULT 0 NOT NULL,
	`reorder_threshold` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_items_quantity_nonnegative" CHECK("inventory_items"."current_quantity" >= 0),
	CONSTRAINT "inventory_items_threshold_nonnegative" CHECK("inventory_items"."reorder_threshold" is null or "inventory_items"."reorder_threshold" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_items_business_id_idx` ON `inventory_items` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_business_name_unique` ON `inventory_items` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stock_movements_delta_nonzero" CHECK("stock_movements"."quantity_delta" <> 0),
	CONSTRAINT "stock_movements_balance_nonnegative" CHECK("stock_movements"."balance_after" >= 0),
	CONSTRAINT "stock_movements_type_check" CHECK("stock_movements"."type" in ('purchase', 'kitchen_issue', 'waste', 'adjustment', 'return'))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_item_created_at_idx` ON `stock_movements` (`inventory_item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_business_created_at_idx` ON `stock_movements` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `kitchen_ticket_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`kitchen_ticket_id` text NOT NULL,
	`order_item_id` text,
	`item_name_snapshot` text NOT NULL,
	`quantity` integer NOT NULL,
	`action` text DEFAULT 'add' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`kitchen_ticket_id`) REFERENCES `kitchen_tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "kitchen_ticket_items_quantity_positive" CHECK("kitchen_ticket_items"."quantity" > 0),
	CONSTRAINT "kitchen_ticket_items_action_check" CHECK("kitchen_ticket_items"."action" in ('add', 'cancel'))
);
--> statement-breakpoint
CREATE INDEX `kitchen_ticket_items_ticket_id_idx` ON `kitchen_ticket_items` (`kitchen_ticket_id`);--> statement-breakpoint
CREATE INDEX `kitchen_ticket_items_business_id_idx` ON `kitchen_ticket_items` (`business_id`);--> statement-breakpoint
CREATE TABLE `kitchen_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`created_by` text,
	`print_status` text DEFAULT 'pending' NOT NULL,
	`printed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "kitchen_tickets_sequence_positive" CHECK("kitchen_tickets"."sequence" > 0),
	CONSTRAINT "kitchen_tickets_type_check" CHECK("kitchen_tickets"."type" in ('initial', 'addition', 'cancellation')),
	CONSTRAINT "kitchen_tickets_print_status_check" CHECK("kitchen_tickets"."print_status" in ('pending', 'printed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `kitchen_tickets_business_id_idx` ON `kitchen_tickets` (`business_id`);--> statement-breakpoint
CREATE INDEX `kitchen_tickets_order_id_idx` ON `kitchen_tickets` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `kitchen_tickets_order_sequence_unique` ON `kitchen_tickets` (`order_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `menu_categories_business_id_idx` ON `menu_categories` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_business_name_unique` ON `menu_categories` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`selling_price_minor` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "menu_items_price_nonnegative" CHECK("menu_items"."selling_price_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `menu_items_business_id_idx` ON `menu_items` (`business_id`);--> statement-breakpoint
CREATE INDEX `menu_items_category_id_idx` ON `menu_items` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_items_business_name_unique` ON `menu_items` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `app_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text,
	`item_name_snapshot` text NOT NULL,
	`unit_price_minor_snapshot` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_money_nonnegative" CHECK("order_items"."unit_price_minor_snapshot" >= 0 and "order_items"."line_total_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_business_id_idx` ON `order_items` (`business_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_number` integer NOT NULL,
	`order_type` text NOT NULL,
	`table_id` text,
	`created_by` text,
	`status` text DEFAULT 'open' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`notes` text,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "orders_number_positive" CHECK("orders"."order_number" > 0),
	CONSTRAINT "orders_type_check" CHECK("orders"."order_type" in ('dine_in', 'takeaway')),
	CONSTRAINT "orders_status_check" CHECK("orders"."status" in ('open', 'sent_to_kitchen', 'preparing', 'ready', 'completed', 'cancelled')),
	CONSTRAINT "orders_payment_status_check" CHECK("orders"."payment_status" in ('unpaid', 'partially_paid', 'paid', 'refunded')),
	CONSTRAINT "orders_totals_nonnegative" CHECK("orders"."subtotal_minor" >= 0 and "orders"."discount_minor" >= 0 and "orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `orders_business_status_idx` ON `orders` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `orders_business_table_idx` ON `orders` (`business_id`,`table_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_business_number_unique` ON `orders` (`business_id`,`order_number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'recorded' NOT NULL,
	`reference` text,
	`received_by` text,
	`received_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_amount_positive" CHECK("payments"."amount_minor" > 0),
	CONSTRAINT "payments_method_check" CHECK("payments"."method" in ('cash', 'mobile_money', 'card', 'other')),
	CONSTRAINT "payments_status_check" CHECK("payments"."status" in ('recorded', 'refunded', 'voided'))
);
--> statement-breakpoint
CREATE INDEX `payments_business_id_idx` ON `payments` (`business_id`);--> statement-breakpoint
CREATE INDEX `payments_order_received_at_idx` ON `payments` (`order_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`order_id` text NOT NULL,
	`receipt_number` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`payment_summary` text NOT NULL,
	`issued_at` text NOT NULL,
	`issued_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "receipts_number_positive" CHECK("receipts"."receipt_number" > 0),
	CONSTRAINT "receipts_total_nonnegative" CHECK("receipts"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `receipts_business_id_idx` ON `receipts` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_business_number_unique` ON `receipts` (`business_id`,`receipt_number`);--> statement-breakpoint
CREATE TABLE `restaurant_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "restaurant_tables_capacity_positive" CHECK("restaurant_tables"."capacity" > 0),
	CONSTRAINT "restaurant_tables_status_check" CHECK("restaurant_tables"."status" in ('available', 'occupied', 'reserved'))
);
--> statement-breakpoint
CREATE INDEX `restaurant_tables_business_id_idx` ON `restaurant_tables` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `restaurant_tables_business_name_unique` ON `restaurant_tables` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`pin_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('owner', 'manager', 'cashier', 'waiter', 'kitchen', 'inventory'))
);
--> statement-breakpoint
CREATE INDEX `users_business_id_idx` ON `users` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_business_name_unique` ON `users` (`business_id`,`name`);--> statement-breakpoint
CREATE TRIGGER `menu_items_category_business_guard`
BEFORE INSERT ON `menu_items`
FOR EACH ROW WHEN (SELECT business_id FROM menu_categories WHERE id = NEW.category_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'menu category belongs to another business');
END;--> statement-breakpoint
CREATE TRIGGER `orders_table_business_guard`
BEFORE INSERT ON `orders`
FOR EACH ROW WHEN NEW.table_id IS NOT NULL AND (SELECT business_id FROM restaurant_tables WHERE id = NEW.table_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'table belongs to another business');
END;--> statement-breakpoint
CREATE TRIGGER `order_items_order_business_guard`
BEFORE INSERT ON `order_items`
FOR EACH ROW WHEN (SELECT business_id FROM orders WHERE id = NEW.order_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'order belongs to another business');
END;--> statement-breakpoint
CREATE TRIGGER `stock_movements_item_business_guard`
BEFORE INSERT ON `stock_movements`
FOR EACH ROW WHEN (SELECT business_id FROM inventory_items WHERE id = NEW.inventory_item_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'inventory item belongs to another business');
END;
