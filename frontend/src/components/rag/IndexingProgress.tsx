import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CountUp } from "./primitives";

const STEPS = ["Reading", "Chunking", "Embedding", "Stored in local ChromaDB"];

export function IndexingProgress() {
  const { progress: p } = useStore();
  const pct = p
    ? p.step >= 3
      ? 1
      : (p.step + (p.step === 0 ? p.filesRead / Math.max(1, p.totalFiles) : p.step === 1 ? p.chunks / Math.max(1, p.totalChunks) : p.embedded / Math.max(1, p.totalChunks))) / 3
    : 0;
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <AnimatePresence>
      {p && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
          aria-live="polite"
        >
          <div className="flex gap-3 rounded-lg border bg-surface p-3">
            <svg viewBox="0 0 52 52" className="size-14 shrink-0 -rotate-90" aria-hidden>
              <circle cx="26" cy="26" r={R} fill="none" strokeWidth="4" className="stroke-muted" />
              <motion.circle
                cx="26"
                cy="26"
                r={R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className="stroke-primary"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: C * (1 - pct) }}
                transition={{ ease: "easeOut" }}
              />
            </svg>
            <div className="min-w-0 flex-1 space-y-1">
              <ol className="space-y-0.5 text-xs">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn("flex items-center gap-1.5", i > p.step && "text-muted-foreground")}>
                    {i < p.step || p.step === 4 ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="size-3 text-success" />
                      </motion.span>
                    ) : (
                      <span className={cn("size-3 rounded-full border", i === p.step && "border-primary bg-primary/40 animate-pulse")} />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                <CountUp value={p.filesRead} />/{p.totalFiles} files · <CountUp value={p.chunks} /> chunks ·{" "}
                <CountUp value={p.embedded} /> embedded
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
