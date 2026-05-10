/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Sora", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        elevated: "0 28px 45px -30px rgba(17, 24, 39, 0.72)",
        glass: "0 18px 42px -26px rgba(15, 17, 23, 0.9)",
        "glow-violet": "0 0 0 1px rgba(139, 92, 246, 0.4), 0 10px 35px -16px rgba(99, 102, 241, 0.65)",
        "glow-cyan": "0 0 0 1px rgba(34, 211, 238, 0.38), 0 10px 35px -16px rgba(59, 130, 246, 0.62)",
        "glow-emerald": "0 0 0 1px rgba(16, 185, 129, 0.45), 0 10px 35px -14px rgba(5, 150, 105, 0.65)",
        "glow-rose": "0 0 0 1px rgba(251, 113, 133, 0.45), 0 10px 35px -14px rgba(244, 63, 94, 0.62)",
        "glow-amber": "0 0 0 1px rgba(251, 191, 36, 0.45), 0 10px 35px -14px rgba(245, 158, 11, 0.62)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(129, 140, 248, 0.35)" },
          "50%": { boxShadow: "0 0 0 10px rgba(129, 140, 248, 0)" },
        },
        "shake-soft": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-2px)" },
          "40%": { transform: "translateX(2px)" },
          "60%": { transform: "translateX(-1px)" },
          "80%": { transform: "translateX(1px)" },
        },
        "float-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 420ms ease-out",
        "scale-in": "scale-in 280ms ease-out",
        "pulse-soft": "pulse-soft 1.5s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "shake-soft": "shake-soft 360ms ease-in-out",
        "float-soft": "float-soft 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
