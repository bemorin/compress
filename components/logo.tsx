/** The Compress mark: three picture frames pressed together. The favicon (public/icon.svg) is the same drawing. */
export function Logo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`logo ${className}`} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="12" y="4.5" width="16" height="12" rx="2.6" stroke="currentColor" strokeOpacity=".32" strokeWidth="1.7" />
      <rect x="8" y="8.5" width="16" height="12" rx="2.6" stroke="currentColor" strokeOpacity=".58" strokeWidth="1.7" className="logo-fill" />
      <rect x="4" y="12.5" width="16" height="12" rx="2.6" stroke="currentColor" strokeWidth="1.8" className="logo-fill" />
      <circle cx="8.6" cy="16.9" r="1.35" fill="currentColor" />
      <path d="M6.6 22.2 10.9 18.6l2.8 2.2 1.9-1.5 2.6 2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
