import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { businesses } from "./businesses";
import { users } from "./users";

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    expenseDate: text("expense_date").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    paymentMethod: text("payment_method").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("expenses_business_date_idx").on(table.businessId, table.expenseDate),
    check(
      "expenses_amount_positive",
      sql`typeof(${table.amountMinor}) = 'integer' and ${table.amountMinor} > 0 and ${table.amountMinor} <= 9007199254740991`,
    ),
    check(
      "expenses_category_valid",
      sql`${table.category} in ('Ingredients', 'Utilities', 'Transport', 'Wages', 'Maintenance', 'Rent', 'Other')`,
    ),
    check(
      "expenses_payment_method_valid",
      sql`${table.paymentMethod} in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')`,
    ),
    check(
      "expenses_description_valid",
      sql`length(trim(${table.description})) between 1 and 240`,
    ),
    check("expenses_version_positive", sql`${table.version} > 0`),
  ],
);
