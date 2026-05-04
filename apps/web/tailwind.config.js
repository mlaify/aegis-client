/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        // System UI default, with Inter as the preferred web font when available.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Aegis-flavored palette: deep slate background with cyan accent.
        // Tuned for both light and dark modes via Tailwind's `dark:` variants.
        aegis: {
          accent: "#22d3ee",
          accentDeep: "#0e7490",
          danger: "#f87171",
          warn: "#facc15",
          ok: "#34d399",
        },
      },
    },
  },
  plugins: [],
};
