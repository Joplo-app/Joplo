/** Joplo 的 logo：黄色圆角方块里的笑脸（高光圆眼 + J 形笑嘴）。与 assets/brand/joplo-mark.svg 保持一致。 */
export function JoploMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="120" height="120" rx="30" fill="#FFD23F" />
      <circle cx="40" cy="40" r="9" fill="#1E1E1E" />
      <circle cx="43" cy="36" r="3" fill="#FFFFFF" />
      <circle cx="87" cy="40" r="9" fill="#1E1E1E" />
      <circle cx="90" cy="36" r="3" fill="#FFFFFF" />
      <path d="M93 60 V72 Q93 100 63 100 Q41 100 31 82" fill="none" stroke="#1E1E1E" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
