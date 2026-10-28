// The app tile (gradient + check mark) as an ImageResponse element – shared by apple-icon and the PWA icons.
// The tile is a full square: iOS and Android round the corners themselves.
export function AppIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundImage: "linear-gradient(135deg, #8b5cf6, #14b8a6)",
      }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle cx="29" cy="36" r="15" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
        <path d="M20 35.5 28.5 44 49 17" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="49" cy="17" r="3.5" fill="#fde047" />
      </svg>
    </div>
  );
}
