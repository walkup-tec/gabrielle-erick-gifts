/** Ramo decorativo discreto usado como separador entre seções. */
export function Ramo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 24"
      aria-hidden="true"
      className={`h-6 w-40 text-accent ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
    >
      <path d="M8 12h144" opacity="0.5" />
      <path d="M62 12c4-6 10-8 14-7-1 5-6 8-14 7Z" />
      <path d="M98 12c-4-6-10-8-14-7 1 5 6 8 14 7Z" />
      <path d="M80 5.5v13" opacity="0.7" />
      <circle cx="80" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
