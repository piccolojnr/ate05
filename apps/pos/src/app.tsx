import { StatusMessage } from "@ate05/ui";

export function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">ATE05 POS</h1>
        <StatusMessage>The application is running.</StatusMessage>
      </section>
    </main>
  );
}
