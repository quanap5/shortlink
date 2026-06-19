import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chocolate: "#2A1A12",
        cream: "#F4ECD8",
        ink: "#2A1A12",
        line: "#d8dee8",
        mist: "#f5f7fb",
        ochre: "#D4A03E",
        peach: "#ffb38a",
        pink: "#ffc6df",
        sky: "#b9d8ff",
        terracotta: "#A14B2B",
        teal: "#167a7f",
        vintage: {
          paper: "#F4ECD8",
          mint: "#b7f7d6",
          yellow: "#D4A03E",
        },
        warm: "#8f4e1d",
        yellow: "#D4A03E",
      },
      boxShadow: {
        retro: "6px 6px 0 #2A1A12",
        "retro-sm": "3px 3px 0 #2A1A12",
      },
    },
  },
  plugins: [],
};

export default config;
