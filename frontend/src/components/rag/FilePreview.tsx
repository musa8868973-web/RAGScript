import { useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { CopyButton } from "./primitives";
import { useCodeTheme } from "./CodeBlock";

export interface PreviewTarget {
  path: string;
  startLine?: number;
  endLine?: number;
}

export function FilePreview({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const { files } = useStore();
  const style = useCodeTheme();
  const box = useRef<HTMLDivElement>(null);
  const file = target ? files.find((f) => f.path === target.path) : undefined;

  useEffect(() => {
    if (!target?.startLine) return;
    const t = setTimeout(() => {
      box.current?.querySelector(`[data-line="${target.startLine}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
    return () => clearTimeout(t);
  }, [target, file]);

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-4 pr-12 text-left">
          <SheetTitle className="truncate font-mono text-sm">{target?.path}</SheetTitle>
          <SheetDescription>
            {target?.startLine ? `Lines ${target.startLine}-${target.endLine}` : file ? `${file.content.split("\n").length} lines` : ""}
          </SheetDescription>
          {file && <CopyButton text={file.content} label="Copy file" className="w-fit" />}
        </SheetHeader>
        <div ref={box} className="min-h-0 flex-1 overflow-auto">
          {file ? (
            <SyntaxHighlighter
              language={file.language}
              style={style}
              showLineNumbers
              wrapLines
              lineProps={(n: number) => {
                const hit = target?.startLine && n >= target.startLine && n <= (target.endLine ?? target.startLine);
                return {
                  "data-line": n,
                  style: { display: "block", background: hit ? "var(--highlight-line)" : undefined },
                } as React.HTMLProps<HTMLElement>;
              }}
              customStyle={{ margin: 0, background: "transparent", fontSize: "0.78rem" }}
              codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
            >
              {file.content}
            </SyntaxHighlighter>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">This file is no longer loaded.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
