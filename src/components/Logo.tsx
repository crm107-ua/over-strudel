/** Over Strudel mark: one hairline circle, one wave that resolves into a note. Monochrome (uses currentColor). */
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Over Strudel"
    >
      <circle cx="24" cy="24" r="21" strokeWidth="1.5" opacity="0.9" />
      <path d="M9.5 28.5 C 15 28.5, 16 19.5, 22 19.5 C 28 19.5, 28 28.5, 33 28.5" strokeWidth="1.8" />
      <circle cx="37.5" cy="28.5" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
