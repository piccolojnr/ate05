ALTER TABLE `menu_items` ADD `pricing_mode` text DEFAULT 'fixed' NOT NULL CHECK (`pricing_mode` in ('fixed', 'options'));--> statement-breakpoint
CREATE TABLE `menu_item_price_options` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`name` text NOT NULL,
	`price_minor` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "menu_item_price_options_name_nonempty" CHECK(length(trim("menu_item_price_options"."name")) > 0),
	CONSTRAINT "menu_item_price_options_price_nonnegative" CHECK("menu_item_price_options"."price_minor" >= 0),
	CONSTRAINT "menu_item_price_options_sort_nonnegative" CHECK("menu_item_price_options"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `menu_item_price_options_business_id_idx` ON `menu_item_price_options` (`business_id`);--> statement-breakpoint
CREATE INDEX `menu_item_price_options_menu_item_id_idx` ON `menu_item_price_options` (`menu_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_item_price_options_item_name_unique` ON `menu_item_price_options` (`menu_item_id`,`name`) WHERE `active` = 1;--> statement-breakpoint
CREATE TRIGGER `menu_item_price_options_item_business_guard`
BEFORE INSERT ON `menu_item_price_options`
FOR EACH ROW WHEN (SELECT business_id FROM menu_items WHERE id = NEW.menu_item_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'menu item belongs to another business');
END;--> statement-breakpoint
CREATE TRIGGER `menu_item_price_options_item_business_update_guard`
BEFORE UPDATE OF menu_item_id, business_id ON `menu_item_price_options`
FOR EACH ROW WHEN (SELECT business_id FROM menu_items WHERE id = NEW.menu_item_id) <> NEW.business_id
BEGIN
  SELECT RAISE(ABORT, 'menu item belongs to another business');
END;--> statement-breakpoint
ALTER TABLE `order_items` ADD `price_option_id` text REFERENCES menu_item_price_options(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `price_option_name_snapshot` text;--> statement-breakpoint
CREATE INDEX `order_items_price_option_id_idx` ON `order_items` (`price_option_id`);
