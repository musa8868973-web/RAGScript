import { motion } from "framer-motion";
import { FileSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import { sourceKey, type Source } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ContextPanel({
  sources,
  highlighted,
  onOpen,
  loading,
}: {
  sources: Source[];
  highlighted: string | null;
  onOpen: (s: Source) => void;
  loading?: boolean;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (highlighted) refs.current[highlighted]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Retrieved Context</h2>
        <p className="text-xs text-muted-foreground">Chunks used for the selected answer</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading && !sources.length &&
          [0, 1, 2].map((i) => <div key={i} className="shimmer h-24 rounded-lg" />)}
        {!loading && !sources.length && (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            <div>
              <FileSearch className="mx-auto mb-2 size-6" />
              Ask a question to see which code chunks were retrieved.
            </div>
          </div>
        )}
        {sources.map((s, i) => {
          const k = sourceKey(s);
          const active = k === highlighted;
          return (
            <motion.button
              key={k}
              ref={(el) => {
                refs.current[k] = el;
              }}
              type="button"
              onClick={() => onOpen(s)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary ring-2 ring-primary/40",
              )}
              aria-label={`Open ${k}, relevance ${Math.round(s.score * 100)}%`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs font-medium">{s.file.split("/").pop()}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  L{s.startLine}-{s.endLine}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${s.score * 100}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: "easeOut" }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{Math.round(s.score * 100)}% relevant</p>
              <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                {s.snippet.split("\n").slice(0, 6).join("\n")}
              </pre>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
