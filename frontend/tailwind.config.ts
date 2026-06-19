import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        line: "#d8dee8",
        mist: "#f5f7fb",
        teal: "#167a7f",
      },
    },
  },
  plugins: [],
};

export default config;
