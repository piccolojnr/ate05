import {
  sameExpenseInput,
  validateExpenseId,
  validateExpenseInput,
  type CreateExpenseInput,
  type Expense,
  type UpdateExpenseInput,
} from "@ate05/domain";

export interface ExpenseDatabase {
  query<T extends object>(sql: string, values: unknown[]): Promise<T[]>;
  execute(sql: string, values?: unknown[]): Promise<void>;
}

const columns =
  "id, business_id AS businessId, amount_minor AS amountMinor, expense_date AS expenseDate, category, description, payment_method AS paymentMethod, created_by AS createdBy, updated_by AS updatedBy, created_at AS createdAt, updated_at AS updatedAt, version";

/** Called inside the native client's database lock, using its signed-in business. */
export function expensePersistence(
  db: ExpenseDatabase,
  businessId: string,
  actorId: string,
) {
  async function find(id: string): Promise<Expense | undefined> {
    return (
      await db.query<Expense>(
        `SELECT ${columns} FROM expenses WHERE id = $1 AND business_id = $2`,
        [id, businessId],
      )
    )[0];
  }
  async function transaction<T>(operation: () => Promise<T>): Promise<T> {
    await db.execute("BEGIN IMMEDIATE");
    try {
      const result = await operation();
      await db.execute("COMMIT");
      return result;
    } catch (cause) {
      await db.execute("ROLLBACK");
      throw cause;
    }
  }
  return {
    list: () =>
      db.query<Expense>(
        `SELECT ${columns} FROM expenses WHERE business_id = $1 ORDER BY expense_date DESC, created_at DESC, id DESC`,
        [businessId],
      ),
    async create(input: CreateExpenseInput): Promise<Expense> {
      validateExpenseId(input.id);
      const values = validateExpenseInput(input);
      return transaction(async () => {
        const existing = await find(input.id);
        if (existing) {
          if (
            existing.createdBy === actorId &&
            sameExpenseInput(existing, values)
          )
            return existing;
          throw new Error(
            "This expense reference has already been used. Reopen Expenses before trying again.",
          );
        }
        const now = new Date().toISOString();
        await db.execute(
          "INSERT INTO expenses (id, business_id, amount_minor, expense_date, category, description, payment_method, created_by, updated_by, created_at, updated_at, version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $9, 1)",
          [
            input.id,
            businessId,
            values.amountMinor,
            values.expenseDate,
            values.category,
            values.description,
            values.paymentMethod,
            actorId,
            now,
          ],
        );
        return (await find(input.id))!;
      });
    },
    async update(input: UpdateExpenseInput): Promise<Expense> {
      validateExpenseId(input.id);
      const values = validateExpenseInput(input);
      if (!Number.isSafeInteger(input.version) || input.version < 1)
        throw new Error("Expense version is invalid.");
      return transaction(async () => {
        const existing = await find(input.id);
        if (!existing) throw new Error("Expense not found.");
        if (existing.version !== input.version)
          throw new Error(
            "This expense has changed. Close this form and refresh Expenses before editing again.",
          );
        await db.execute(
          "UPDATE expenses SET amount_minor = $1, expense_date = $2, category = $3, description = $4, payment_method = $5, updated_by = $6, updated_at = $7, version = version + 1 WHERE id = $8 AND business_id = $9 AND version = $10",
          [
            values.amountMinor,
            values.expenseDate,
            values.category,
            values.description,
            values.paymentMethod,
            actorId,
            new Date().toISOString(),
            input.id,
            businessId,
            input.version,
          ],
        );
        return (await find(input.id))!;
      });
    },
  };
}
