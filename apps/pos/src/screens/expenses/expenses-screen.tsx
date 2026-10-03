import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button, Input, Select } from "@ate05/ui";
import {
  expenseCategories,
  expensePaymentLabels,
  expensePaymentMethods,
  parseExpenseAmount,
  validateExpenseInput,
  type Expense,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@ate05/domain";
import type { ExpensesClient } from "../../lib/client-capabilities";
import { formatGhs } from "../../lib/pos-client";
import { notify } from "../../lib/notifications";
import { Icon } from "../../components/icons";

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatExpenseDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ExpenseDialog({
  expense,
  client,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  client: ExpensesClient;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id] = useState(() => expense?.id ?? crypto.randomUUID());
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(
    expense ? (expense.amountMinor / 100).toFixed(2) : "",
  );
  const [date, setDate] = useState(expense?.expenseDate ?? localDate());
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? "Ingredients",
  );
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(
    expense?.paymentMethod ?? "cash",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    try {
      const input = validateExpenseInput({
        amountMinor: parseExpenseAmount(amount),
        expenseDate: date,
        category,
        description,
        paymentMethod,
      });
      submitting.current = true;
      setSaving(true);
      const saved = expense
        ? await client.updateExpense({ ...input, id, version: expense.version })
        : await client.createExpense({ ...input, id });
      onSaved(saved);
      notify.success(expense ? "Expense updated." : "Expense recorded.");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this expense. Try again.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="expense-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border bg-card p-0 text-foreground shadow-floating backdrop:bg-foreground/30"
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <div className="border-b px-6 py-5">
          <h2
            id="expense-dialog-title"
            className="text-xl font-semibold tracking-tight"
          >
            {expense ? "Edit expense" : "New expense"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record money spent by the restaurant.
          </p>
        </div>
        <fieldset disabled={saving} className="space-y-4 px-6 py-5">
          <label className="block text-sm font-medium">
            Description
            <Input
              autoFocus
              className="mt-1.5"
              value={description}
              maxLength={240}
              placeholder="e.g. Vegetables for the kitchen"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              Amount (GHS)
              <Input
                className="mt-1.5 tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Expense date
              <Input
                className="mt-1.5"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Category
            <Select
              className="mt-1.5"
              aria-label="Category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ExpenseCategory)
              }
            >
              {expenseCategories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Payment method
            <Select
              className="mt-1.5"
              aria-label="Payment method"
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as ExpensePaymentMethod)
              }
            >
              {expensePaymentMethods.map((value) => (
                <option key={value} value={value}>
                  {expensePaymentLabels[value]}
                </option>
              ))}
            </Select>
          </label>
          {expense && (
            <p className="text-xs text-muted-foreground">
              Originally recorded{" "}
              {formatExpenseDate(expense.createdAt.slice(0, 10))}. Changes
              retain the original record.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </fieldset>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : expense ? "Save changes" : "Save expense"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function ExpensesScreen({ client }: { client: ExpensesClient }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [editor, setEditor] = useState<{
    expense: Expense | null;
    opener: HTMLButtonElement;
  } | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const entries = await client.listExpenses();
      if (request.current === current) setExpenses(entries);
    } catch (cause) {
      if (request.current === current)
        setError(
          cause instanceof Error ? cause.message : "Unable to load expenses.",
        );
    } finally {
      if (request.current === current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const pending = request;
    return () => {
      window.clearTimeout(timer);
      pending.current++;
    };
  }, [refresh]);

  const visible = useMemo(
    () =>
      expenses
        .filter(
          (expense) =>
            (category === "All categories" || expense.category === category) &&
            expense.description
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
        )
        .sort(
          (a, b) =>
            b.expenseDate.localeCompare(a.expenseDate) ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        ),
    [expenses, category, search],
  );

  return (
    <section aria-label="Expense records" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Expenses</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep a clear record of restaurant spending.
          </p>
        </div>
        <Button
          disabled={loading}
          onClick={(event) =>
            setEditor({ expense: null, opener: event.currentTarget })
          }
        >
          <Icon name="plus" width={16} height={16} />
          Add expense
        </Button>
      </header>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <Input
            aria-label="Search expenses"
            placeholder="Search descriptions…"
            className="max-w-xs shadow-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="w-44 shrink-0">
            <Select
              aria-label="Filter expense category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>All categories</option>
              {expenseCategories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          {!loading && !error && (
            <span className="ml-auto text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "expense" : "expenses"}
            </span>
          )}
        </div>
        {loading ? (
          <p
            role="status"
            className="p-12 text-center text-sm text-muted-foreground"
          >
            Loading expenses…
          </p>
        ) : error ? (
          <div className="space-y-3 p-12 text-center">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : !visible.length ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">
              {expenses.length ? "No matching expenses" : "No expenses yet"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {expenses.length
                ? "Try another description or category."
                : "Add your first expense to start tracking spending."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Recorded expenses, newest expense date first
              </caption>
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Payment
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((expense) => (
                  <tr key={expense.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      <time dateTime={expense.expenseDate}>
                        {formatExpenseDate(expense.expenseDate)}
                      </time>
                    </td>
                    <td className="max-w-xs break-words px-5 py-4 font-medium">
                      {expense.description}
                      {expense.version > 1 && (
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          Edited
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {expense.category}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {expensePaymentLabels[expense.paymentMethod]}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums">
                      {formatGhs(expense.amountMinor)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit expense: ${expense.description}`}
                        onClick={(event) =>
                          setEditor({ expense, opener: event.currentTarget })
                        }
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editor && (
        <ExpenseDialog
          expense={editor.expense}
          client={client}
          onClose={() => {
            const opener = editor.opener;
            setEditor(null);
            window.requestAnimationFrame(() => opener.focus());
          }}
          onSaved={(saved) =>
            setExpenses((current) => [
              saved,
              ...current.filter((entry) => entry.id !== saved.id),
            ])
          }
        />
      )}
    </section>
  );
}
