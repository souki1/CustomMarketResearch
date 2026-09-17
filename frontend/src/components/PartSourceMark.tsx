type PartSourceMarkProps = {
  className?: string
}

/** Compact PartSource.ai mark for chrome (navbar, auth). */
export function PartSourceMark({ className }: PartSourceMarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.16" />
      <path
        fill="currentColor"
        d="M9.2 8.4h8.1c3.7 0 6.2 2.3 6.2 5.7 0 3.5-2.5 5.8-6.2 5.8h-4.4v3.7H9.2V8.4Zm3.7 3.1v5.2h4.1c1.8 0 2.9-1.1 2.9-2.6s-1.1-2.6-2.9-2.6h-4.1Z"
      />
      <path
        fill="currentColor"
        fillOpacity="0.72"
        d="M20.6 23.6h2.2v-2.1h2.1v-2.2h-2.1v-2.1h-2.2v2.1h-2.1v2.2h2.1v2.1Z"
      />
    </svg>
  )
}
