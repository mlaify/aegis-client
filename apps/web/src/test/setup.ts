import "@testing-library/jest-dom";

// jsdom doesn't implement crypto.randomUUID
if (!crypto.randomUUID) {
  let counter = 0;
  Object.defineProperty(crypto, "randomUUID", {
    value: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`,
  });
}
