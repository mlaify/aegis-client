import "@testing-library/jest-dom";

// jsdom doesn't implement crypto.randomUUID
if (!crypto.randomUUID) {
  let counter = 0;
  Object.defineProperty(crypto, "randomUUID", {
    value: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`,
  });
}

// Node 25's built-in `--localstorage-file` plumbing collides with jsdom's
// localStorage in vitest 4.1, leaving an object that's missing setItem /
// getItem / clear. Replace it with an in-memory shim so tests have a
// predictable Storage-shaped object regardless of which one wins.
{
  const map = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
}
