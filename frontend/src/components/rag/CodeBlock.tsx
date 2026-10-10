import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "@/lib/store";
import { CopyButton } from "./primitives";

export function useCodeTheme() {
  const { theme } = useStore();
  return theme === "dark" ? oneDark : oneLight;
}

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const style = useCodeTheme();
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="font-mono text-xs text-muted-foreground">{language || "text"}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <div className="max-w-full overflow-x-auto">
        <SyntaxHighlighter
          language={language || "text"}
          style={style}
          customStyle={{ margin: 0, background: "transparent", fontSize: "0.8rem", padding: "0.85rem 1rem" }}
          codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export const CITE_RE = /^([\w./-]+\.\w+):(\d+)-(\d+)$/;

export function Markdown({ content, onCite }: { content: string; onCite?: (cite: string) => void }) {
  return (
    <div className="answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className ?? "");
            const text = String(children ?? "");
            if (match || text.includes("\n")) {
              return <CodeBlock code={text.replace(/\n$/, "")} language={match?.[1] ?? "text"} />;
            }
            if (onCite && CITE_RE.test(text))
              return (
                <button type="button" className="cite-inline" onClick={() => onCite(text)} aria-label={`Open ${text}`}>
                  {text}
                </button>
              );
            return <code>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
