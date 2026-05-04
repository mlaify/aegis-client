import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
// `@aegis/sdk` is a sibling repo (mlaify/aegis-sdk) cloned next to mlaify/aegis-client
// at the top of `mlaify/aegis/`. We alias it directly to the source file so we don't
// need to publish or `npm link` during development. The SDK is currently type-only;
// when it grows runtime helpers we'll switch to a workspace dependency.
var sdkPath = fileURLToPath(new URL("../../../aegis-sdk/typescript/src/index.ts", import.meta.url));
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@aegis/sdk": sdkPath,
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 5173,
    },
});
