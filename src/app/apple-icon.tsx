import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the tile is a full square here.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: "linear-gradient(135deg, #8b5cf6, #14b8a6)",
        }}
      >
        <svg viewBox="0 0 64 64" width="180" height="180">
          <circle cx="29" cy="36" r="15" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
          <path d="M20 35.5 28.5 44 49 17" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="49" cy="17" r="3.5" fill="#fde047" />
        </svg>
      </div>
    ),
    size,
  );
}
