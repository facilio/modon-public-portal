/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary royal blue (matches the reference "Check Status" / "Begin" buttons)
        primary: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
          soft: "#eff4ff",
        },
        // Dark navy used for headings
        ink: {
          DEFAULT: "#0f2340",
          soft: "#1e293b",
        },
        // Neutral text / borders / surfaces
        muted: "#64748b",
        line: "#e6e8ec",
        canvas: "#f5f7fa",
        // Accent tints for the "what you'll need" icon squares
        tint: {
          blue: "#eaf1ff",
          purple: "#f1ecfe",
          green: "#e6f7f0",
          red: "#fdecec",
          amber: "#fef4e6",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 35, 64, 0.04), 0 1px 3px rgba(16, 35, 64, 0.06)",
        cardhover: "0 4px 12px rgba(16, 35, 64, 0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
