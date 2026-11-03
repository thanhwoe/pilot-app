/**
 * An in-memory `expo-secure-store` for Jest. Plain functions, not jest.fn: `resetAllMocks` in a
 * test's beforeEach would wipe the behaviour of a jest.fn. Use it as
 * `jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock())`.
 */
export function secureStoreMock() {
  const items = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      items.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      items.delete(key);
    },
  };
}
