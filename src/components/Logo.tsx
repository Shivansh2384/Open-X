import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** OpenX brand mark — a gradient tile with a sparkle glyph. */
export function Logo({
  size = 34,
  withText = false,
  className,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5 select-none", className)}>
      <span
        aria-hidden
        className="relative inline-grid place-items-center rounded-[28%] shadow-lg shadow-primary/30"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(135deg, var(--primary), var(--primary-2) 55%, var(--primary-3))",
        }}
      >
        <Sparkles
          style={{ width: size * 0.52, height: size * 0.52 }}
          className="text-white"
          strokeWidth={2.4}
        />
        <span className="pointer-events-none absolute inset-0 rounded-[28%] ring-1 ring-inset ring-white/25" />
      </span>
      {withText && (
        <span className="brand-gradient-text text-lg font-bold tracking-tight">
          OpenX
        </span>
      )}
    </span>
  );
}
