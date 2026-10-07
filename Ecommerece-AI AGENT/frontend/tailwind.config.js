/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0F1420",
          900: "#161C2C",
          800: "#232B40",
          700: "#333D57",
        },
        signal: {
          400: "#7C9CFF",
          500: "#5B7CFA",
          600: "#4361EE",
        },
        amber: {
          400: "#F5B942",
          500: "#EFA323",
        },
        paper: "#F7F6F2",
      },
      fontFamily: {
        display: ["'Sora'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,20,32,0.06), 0 8px 24px -8px rgba(15,20,32,0.12)",
      },
    },
  },
  plugins: [],
};
