import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowDown, FileCode, RefreshCw, Send, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { askQuestion } from "@/lib/api";
import { useStore } from "@/lib/store";
import { sourceKey, uid, type ChatMessage, type Source } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CITE_RE, Markdown } from "./CodeBlock";
import { Footer } from "./Footer";
import { CopyButton, Logo, Skeleton, TypingDots, springTap } from "./primitives";

const SUGGESTIONS = [
  "Explain how BufferManager allocates memory",
  "Which classes inherit from BaseHandler?",
  "Summarize the server module",
  "Where are uploads validated?",
];

export function ChatView({
  chatId,
  ensureChat,
  onCite,
  onSelectMessage,
  highlighted,
  onStreamingChange,
}: {
  chatId: string | null;
  ensureChat: () => string;
  onCite: (s: Source, msgId: string) => void;
  onSelectMessage: (msgId: string) => void;
  highlighted: string | null;
  onStreamingChange: (b: boolean) => void;
}) {
  const { chats, updateChat, files, settings, hydrated, index } = useStore();
  const chat = chats.find((c) => c.id === chatId);
  const messages = chat?.messages ?? [];
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => onStreamingChange(!!streamingId), [streamingId, onStreamingChange]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const streamChat = useRef<string | null>(null);
  useEffect(() => {
    if (streamChat.current && streamChat.current !== chatId) abortRef.current?.abort();
    inputRef.current?.focus();
  }, [chatId]);

  const scrollToBottom = (smooth = true) =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });

  const lastContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    if (atBottom.current) scrollToBottom(false);
  }, [lastContent, messages.length]);

  const run = useCallback(
    async (id: string, query: string, assistantId: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      streamChat.current = id;
      setStreamingId(assistantId);
      onSelectMessage(assistantId);
      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        updateChat(id, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? fn(m) : m)) }));
      try {
        const res = await askQuestion(query, { settings, files, signal: ctrl.signal });
        if (!settings.demoMode && res.usedDemo)
          toast.warning("Backend unreachable — using Demo Mode", { id: "demo-fallback" });
        patch((m) => ({ ...m, sources: res.sources }));
        for await (const chunk of res.stream) {
          if (ctrl.signal.aborted) break;
          patch((m) => ({ ...m, content: m.content + chunk }));
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          patch((m) => ({ ...m, error: (e as Error).message || "Something went wrong" }));
          toast.error("Couldn't get an answer", { description: (e as Error).message });
        }
      } finally {
        setStreamingId(null);
        abortRef.current = null;
        streamChat.current = null;
      }
    },
    [files, settings, updateChat, onSelectMessage],
  );

  function send(text = input) {
    const q = text.trim();
    if (!q || streamingId) return;
    const id = ensureChat();
    const userMsg: ChatMessage = { id: uid(), role: "user", content: q, createdAt: Date.now() };
    const asst: ChatMessage = { id: uid(), role: "assistant", content: "", createdAt: Date.now() };
    updateChat(id, (c) => ({
      ...c,
      title: c.messages.length === 0 && c.title === "New chat" ? q.slice(0, 48) : c.title,
      messages: [...c.messages, userMsg, asst],
    }));
    setInput("");
    atBottom.current = true;
    void run(id, q, asst.id);
  }

  function regenerate(msgId: string) {
    if (!chat || streamingId) return;
    const i = chat.messages.findIndex((m) => m.id === msgId);
    const q = chat.messages
      .slice(0, i)
      .reverse()
      .find((m) => m.role === "user")?.content;
    if (!q) return;
    updateChat(chat.id, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? (({ error: _e, ...rest }) => ({ ...rest, content: "", sources: [], feedback: null }))(m) : m)),
    }));
    void run(chat.id, q, msgId);
  }

  const setFeedback = (msgId: string, f: "up" | "down") =>
    chat &&
    updateChat(chat.id, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, feedback: m.feedback === f ? null : f } : m)),
    }));

  const citeFromText = (m: ChatMessage) => (text: string) => {
    const [, name = "", a = "0", b = "0"] = CITE_RE.exec(text) ?? [];
    const s =
      m.sources?.find((x) => x.file.endsWith(name) && x.startLine === +a && x.endLine === +b) ??
      ({ file: files.find((f) => f.path.endsWith(name))?.path ?? name, startLine: +a, endLine: +b, score: 0, snippet: "" } as Source);
    onCite(s, m.id);
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          atBottom.current = near;
          setShowJump(!near);
        }}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        aria-live="polite"
      >
        {!hydrated ? (
          <div className="mx-auto max-w-3xl space-y-4 p-6">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <div className="hero-backdrop flex min-h-full flex-col">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
              <Logo className="text-3xl" />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Chat with your codebase</h1>
                <p className="text-sm text-muted-foreground">
                  {index.status === "ready"
                    ? `${index.files} files indexed. Your code never leaves your machine.`
                    : "Upload files or load the sample project from the sidebar to get started."}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    {...springTap}
                    transition={{ delay: 0.1 + i * 0.07 }}
                    onClick={() => send(s)}
                    className="min-h-11 rounded-lg border bg-card/70 px-4 py-3 text-left text-sm backdrop-blur hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </div>
            <Footer />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-sm text-user-bubble-foreground">
                      {m.content}
                    </div>
                  ) : (
                    <div className="w-full min-w-0" onClick={() => onSelectMessage(m.id)}>
                      {!m.content && !m.error && streamingId === m.id ? (
                        <TypingDots />
                      ) : (
                        <div>
                          <Markdown content={m.content} onCite={citeFromText(m)} />
                          {streamingId === m.id && <span className="stream-cursor" aria-hidden />}
                        </div>
                      )}
                      {m.error && (
                        <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
                          <AlertCircle className="size-4 shrink-0 text-destructive" />
                          <span className="flex-1">{m.error}</span>
                          <Button size="sm" variant="outline" onClick={() => regenerate(m.id)}>
                            Retry
                          </Button>
                        </div>
                      )}
                      {!!m.sources?.length && (
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Sources">
                          {m.sources.map((s) => {
                            const k = sourceKey(s);
                            return (
                              <motion.button
                                key={k}
                                type="button"
                                {...springTap}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCite(s, m.id);
                                }}
                                className={cn(
                                  "inline-flex min-h-8 items-center gap-1 rounded-full border bg-surface px-2.5 font-mono text-xs hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  highlighted === k && "border-primary text-primary",
                                )}
                              >
                                <FileCode className="size-3" />
                                {s.file.split("/").pop()}:{s.startLine}-{s.endLine}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}
                      {streamingId !== m.id && (m.content || m.error) && (
                        <div className="mt-2 flex items-center gap-0.5 text-muted-foreground">
                          <CopyButton text={m.content} label="Copy" />
                          <Button variant="ghost" size="sm" className="h-8" onClick={() => regenerate(m.id)} disabled={!!streamingId} aria-label="Regenerate answer">
                            <RefreshCw /> <span className="text-xs">Regenerate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("size-8", m.feedback === "up" && "text-success")}
                            aria-label="Good answer"
                            aria-pressed={m.feedback === "up"}
                            onClick={() => setFeedback(m.id, "up")}
                          >
                            <ThumbsUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("size-8", m.feedback === "down" && "text-destructive")}
                            aria-label="Bad answer"
                            aria-pressed={m.feedback === "down"}
                            onClick={() => setFeedback(m.id, "down")}
                          >
                            <ThumbsDown />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showJump && messages.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
            <Button size="sm" variant="secondary" className="pointer-events-auto h-9 rounded-full shadow-lg" onClick={() => scrollToBottom()}>
              <ArrowDown /> Jump to latest
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="safe-bottom sticky bottom-0 border-t bg-background/90 px-3 pt-3 backdrop-blur">
        <form
          className="glow-ring mx-auto flex max-w-3xl items-end gap-2 rounded-xl border bg-card p-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask about your code
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about your code…"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {streamingId ? (
            <Button type="button" size="icon" variant="secondary" className="size-11 shrink-0" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
              <Square className="fill-current" />
            </Button>
          ) : (
            <motion.div {...springTap}>
              <Button type="submit" size="icon" className="size-11 shrink-0 bg-gradient-accent" disabled={!input.trim()} aria-label="Send message">
                <Send />
              </Button>
            </motion.div>
          )}
        </form>
        <p className="py-1.5 text-center text-[11px] text-muted-foreground">
          Enter to send · Shift+Enter for newline · {settings.demoMode ? "Demo Mode" : settings.model}
        </p>
      </div>
    </div>
  );
}
