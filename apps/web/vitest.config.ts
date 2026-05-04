import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

const sdkPath = fileURLToPath(
  new URL("../../../aegis-sdk/typescript/src/index.ts", import.meta.url),
);

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@aegis/sdk": sdkPath,
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
