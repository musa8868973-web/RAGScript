import { animate, motion, useReducedMotion } from "framer-motion";
import { Check, Copy, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import type { IndexStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-gradient-accent font-mono text-xs font-bold text-primary-foreground">
        {"{R}"}
      </span>
      RAG<span className="text-gradient-accent">Script</span>
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useStore();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10" onClick={toggleTheme} aria-label="Toggle light/dark theme">
          <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </motion.span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}

const STATUS: Record<IndexStatus, { label: string; dot: string }> = {
  not_indexed: { label: "Not indexed", dot: "bg-muted-foreground" },
  indexing: { label: "Indexing", dot: "bg-warning animate-pulse" },
  ready: { label: "Ready", dot: "bg-success pulse-dot" },
};

export function StatusBadge({ status }: { status: IndexStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-background/50 px-2.5 py-1 text-xs font-medium" role="status">
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return setN(value);
    const c = animate(n, value, { duration: 0.6, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <span className={cn("tabular-nums", className)}>{n.toLocaleString()}</span>;
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("relative h-8 gap-1.5 overflow-hidden", className)}
      aria-label={done ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done && (
        <motion.span
          className="absolute inset-0 rounded-md bg-success/25"
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}
      {done ? (
        <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500 }}>
          <Check className="text-success" />
        </motion.span>
      ) : (
        <Copy />
      )}
      <span className="text-xs">{done ? "Copied" : label}</span>
    </Button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-label="Assistant is thinking" role="status">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-gradient-accent"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

export const springTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 400, damping: 25 },
} as const;
