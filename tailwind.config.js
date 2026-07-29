/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        /* ── MiraFlow design tokens (design.md §2) ─────────────────── */
        /* rvb channels → opacité native (bg-iris/10, border-line/60…) */
        void: "rgb(var(--bg-void-rgb) / <alpha-value>)",
        base: "rgb(var(--bg-base-rgb) / <alpha-value>)",
        surface: {
          1: "rgb(var(--surface-1-rgb) / <alpha-value>)",
          2: "rgb(var(--surface-2-rgb) / <alpha-value>)",
          3: "rgb(var(--surface-3-rgb) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line-rgb) / calc(<alpha-value> * var(--line-alpha)))",
          strong: "rgb(var(--line-rgb) / calc(<alpha-value> * var(--line-alpha-strong)))",
        },
        hi: "rgb(var(--text-hi-rgb) / <alpha-value>)",
        mid: "rgb(var(--text-mid-rgb) / <alpha-value>)",
        low: "rgb(var(--text-low-rgb) / <alpha-value>)",
        iris: "rgb(var(--iris-rgb) / <alpha-value>)",
        pulse: "rgb(var(--pulse-rgb) / <alpha-value>)",
        mint: "rgb(var(--mint-rgb) / <alpha-value>)",
        amber: "rgb(var(--amber-rgb) / <alpha-value>)",
        rose: "rgb(var(--rose-rgb) / <alpha-value>)",
        violet: "rgb(var(--violet-rgb) / <alpha-value>)",
        "bubble-in": "rgb(var(--bubble-in-rgb) / <alpha-value>)",
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        "r-sm": "10px",
        "r-md": "18px",
        "r-lg": "24px",
      },
      fontFamily: {
        display: ['"Unbounded"', "sans-serif"],
        serif: ['"Instrument Serif"', "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
        arabic: ['"IBM Plex Sans Arabic"', "sans-serif"],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 20px 50px -20px rgba(20,15,40,.18)",
        "card-hover": "0 28px 64px -20px rgba(20,15,40,.24)",
        "glow-iris": "0 0 48px -8px rgba(255,90,78,.45)",
        "glow-mint": "0 0 32px -6px rgba(11,169,141,.4)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(.22,1,.36,1)",
        soft: "cubic-bezier(.4,0,.2,1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "ping-ring": {
          "0%": { transform: "scale(1)", opacity: ".6" },
          "80%,100%": { transform: "scale(2.2)", opacity: "0" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          from: { transform: "translateX(-50%)" },
          to: { transform: "translateX(0)" },
        },
        "dash-flow": {
          to: { strokeDashoffset: "-24" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "core-breathe": {
          "0%,100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.06)" },
        },
        "scroll-drop": {
          "0%": { transform: "translateY(-100%)" },
          "60%,100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "ping-ring": "ping-ring 1.8s cubic-bezier(0,0,.2,1) infinite",
        marquee: "marquee 30s linear infinite",
        "marquee-reverse": "marquee-reverse 44s linear infinite",
        "dash-flow": "dash-flow 1.2s linear infinite",
        "spin-slow": "spin-slow 24s linear infinite",
        "core-breathe": "core-breathe 6s ease-in-out infinite",
        "scroll-drop": "scroll-drop 1.6s cubic-bezier(.4,0,.2,1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
