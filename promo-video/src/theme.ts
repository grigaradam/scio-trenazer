import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadSans } from "@remotion/google-fonts/PlusJakartaSans";
import { Easing } from "remotion";

// Same typefaces as the web app (src/app/layout.tsx).
export const display = loadDisplay("normal", {
  weights: ["700", "800"],
  subsets: ["latin", "latin-ext"],
}).fontFamily;

export const sans = loadSans("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin", "latin-ext"],
}).fontFamily;

// Brand palette from src/app/globals.css.
export const C = {
  bg: "#0f0d17",
  textOnDark: "#f4f2fb",
  mutedOnDark: "#b4aecb",
  surface: "#ffffff",
  surface2: "#f1eff8",
  border: "#e4e1ee",
  text: "#1c1830",
  muted: "#6b6684",
  brand100: "#ede9fe",
  brand300: "#c4b5fd",
  brand400: "#a78bfa",
  brand500: "#8b5cf6",
  brand600: "#7c3aed",
  brand700: "#6d28d9",
  brand800: "#5b21b6",
  teal100: "#ccfbf1",
  teal400: "#2dd4bf",
  teal500: "#14b8a6",
  teal700: "#0f766e",
  marker: "#fde047",
  orange: "#f97316",
  green: "#10b981",
  greenBg: "#ecfdf5",
  greenText: "#065f46",
  red: "#ef4444",
  redBg: "#fef2f2",
  redText: "#991b1b",
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const gradientText = (from: string, to: string): React.CSSProperties => ({
  backgroundImage: `linear-gradient(90deg, ${from}, ${to})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
});
