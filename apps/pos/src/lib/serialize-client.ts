/** Hold the lock for the entire operation, including its reads and transaction.
 * Bind internal method calls to the original client to avoid nested lock waits.
 */
export function serializeClient<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) =>
        navigator.locks.request("ate05-native-database", () =>
          Reflect.apply(method, target, args),
        );
    },
  });
}
