// Lintora logo mark: a doorway (two posts and a lintel) with a highlighter tick. See docs/DESIGN.md.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1F3FBF" />
      <path d="M8 9h16" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M10.5 10v14M21.5 10v14" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 18.2l2.3 2.3 4.4-4.8" fill="none" stroke="#FFD43B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
