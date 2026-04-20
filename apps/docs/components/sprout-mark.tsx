import { cn } from "@/lib/utils";

export function SproutMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("inline-block", className)} aria-hidden>
      <defs>
        <linearGradient id="pm-leaf" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a4f48a" />
          <stop offset="100%" stopColor="#3a9b4f" />
        </linearGradient>
        <linearGradient id="pm-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5fb85a" />
          <stop offset="100%" stopColor="#2d7a3b" />
        </linearGradient>
        <linearGradient id="pm-seed" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffd76b" />
          <stop offset="60%" stopColor="#e6922b" />
          <stop offset="100%" stopColor="#7a3a0c" />
        </linearGradient>
      </defs>
      <path d="M24 36 Q10 34 8 22 Q18 22 24 34 Z" fill="url(#pm-leaf)" />
      <path d="M24 34 Q38 30 40 18 Q28 20 24 32 Z" fill="url(#pm-leaf)" />
      <path d="M24 40 Q22 30 24 18" stroke="url(#pm-stem)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="24" cy="42" rx="9" ry="3" fill="url(#pm-seed)" />
    </svg>
  );
}
