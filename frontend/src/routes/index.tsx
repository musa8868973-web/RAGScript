import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, Menu, PanelLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatView } from "@/components/rag/ChatView";
import { ContextPanel } from "@/components/rag/ContextPanel";
import { FilePreview, type PreviewTarget } from "@/components/rag/FilePreview";
import { Logo } from "@/components/rag/primitives";
import { SettingsDialog } from "@/components/rag/SettingsDialog";
import { Sidebar } from "@/components/rag/Sidebar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useBreakpoint } from "@/hooks/use-media-query";
import { useStore } from "@/lib/store";
import { sourceKey, type Source } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAGScript — Chat with your codebase" },
      { name: "description", content: "Privacy-first AI assistant: upload your code, ask questions, get answers with exact source citations." },
      { property: "og:title", content: "RAGScript — Chat with your codebase" },
      { property: "og:description", content: "Privacy-first RAG assistant for developers. Your code stays yours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

function App() {
  const { chats, createChat, hydrated } = useStore();
  const bp = useBreakpoint();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); // desktop/tablet inline
  const [navOpen, setNavOpen] = useState(false); // phone drawer
  const [ctxOpen, setCtxOpen] = useState(false); // phone/tablet context
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (hydrated && !activeId && chats.length) setActiveId(chats[0]!.id);
    if (activeId && !chats.some((c) => c.id === activeId)) setActiveId(chats[0]?.id ?? null);
  }, [hydrated, chats, activeId]);

  const chat = chats.find((c) => c.id === activeId);
  const sources = useMemo(() => {
    const msgs = chat?.messages ?? [];
    const m = msgs.find((x) => x.id === selectedMsg) ?? [...msgs].reverse().find((x) => x.role === "assistant");
    return m?.sources ?? [];
  }, [chat, selectedMsg]);

  const newChat = useCallback(() => {
    const id = createChat();
    setActiveId(id);
    setSelectedMsg(null);
    setHighlighted(null);
    setNavOpen(false);
  }, [createChat]);

  const ensureChat = useCallback(() => {
    if (activeId && chats.some((c) => c.id === activeId)) return activeId;
    const id = createChat();
    setActiveId(id);
    return id;
  }, [activeId, chats, createChat]);

  const openSource = useCallback((s: Source, msgId?: string) => {
    if (msgId) setSelectedMsg(msgId);
    setHighlighted(sourceKey(s));
    setPreview({ path: s.file, startLine: s.startLine, endLine: s.endLine });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (bp === "phone") setNavOpen((o) => !o);
        else setSidebarOpen((o) => !o);
      } else if (e.key === "Escape") {
        setNavOpen(false);
        setCtxOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bp, newChat]);

  const sidebar = (
    <Sidebar
      activeId={activeId}
      onSelect={(id) => {
        setActiveId(id);
        setSelectedMsg(null);
        setHighlighted(null);
        setNavOpen(false);
      }}
      onNew={newChat}
      onOpenFile={(path) => {
        setPreview({ path });
        setNavOpen(false);
      }}
      onSettings={() => {
        setSettingsOpen(true);
        setNavOpen(false);
      }}
    />
  );
  const context = (
    <ContextPanel
      sources={sources}
      highlighted={highlighted}
      loading={streaming}
      onOpen={(s) => openSource(s)}
    />
  );
  const chatView = (
    <ChatView
      chatId={activeId}
      ensureChat={ensureChat}
      onCite={openSource}
      onSelectMessage={setSelectedMsg}
      highlighted={highlighted}
      onStreamingChange={setStreaming}
    />
  );

  const header = (
    <header className="flex items-center gap-1 border-b px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Toggle sidebar (Ctrl+B)"
        onClick={() => (bp === "phone" ? setNavOpen(true) : setSidebarOpen((o) => !o))}
      >
        {bp === "phone" ? <Menu /> : <PanelLeft />}
      </Button>
      {(bp === "phone" || !sidebarOpen) && <Logo className="text-sm" />}
      <span className="min-w-0 flex-1 truncate px-2 text-sm text-muted-foreground">{bp !== "phone" && chat?.title}</span>
      {bp !== "desktop" && (
        <Button variant="outline" size="sm" className="h-11" onClick={() => setCtxOpen(true)} aria-label="Show retrieved sources">
          <Layers /> Sources{sources.length ? ` (${sources.length})` : ""}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-11" onClick={newChat} aria-label="New chat (Ctrl+K)">
        <Plus />
      </Button>
    </header>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {bp === "desktop" ? (
        <ResizablePanelGroup orientation="horizontal" id="ragscript-layout">
          {sidebarOpen && (
            <>
              <ResizablePanel id="sidebar" defaultSize="22%" minSize="16%" maxSize="35%">
                {sidebar}
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel id="chat" minSize="35%">
            <div className="flex h-full flex-col">
              {header}
              <div className="min-h-0 flex-1">{chatView}</div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="context" defaultSize="26%" minSize="18%" maxSize="40%">
            <div className="h-full border-l bg-sidebar">{context}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          {bp === "tablet" && (
            <AnimatePresence initial={false}>
              {sidebarOpen && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 288, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className="h-full shrink-0 overflow-hidden border-r"
                >
                  <div className="h-full w-72">{sidebar}</div>
                </motion.aside>
              )}
            </AnimatePresence>
          )}
          <main className="flex min-w-0 flex-1 flex-col">
            {header}
            <div className="min-h-0 flex-1">{chatView}</div>
          </main>
          {bp === "phone" ? (
            <>
              <Sheet open={navOpen} onOpenChange={setNavOpen}>
                <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  {sidebar}
                </SheetContent>
              </Sheet>
              <Drawer open={ctxOpen} onOpenChange={setCtxOpen}>
                <DrawerContent className="h-[75dvh]">
                  <DrawerTitle className="sr-only">Retrieved sources</DrawerTitle>
                  <div className="min-h-0 flex-1">{context}</div>
                </DrawerContent>
              </Drawer>
            </>
          ) : (
            <Sheet open={ctxOpen} onOpenChange={setCtxOpen}>
              <SheetContent side="right" className="w-96 max-w-[90vw] p-0">
                <SheetTitle className="sr-only">Retrieved sources</SheetTitle>
                {context}
              </SheetContent>
            </Sheet>
          )}
        </>
      )}
      <FilePreview target={preview} onClose={() => setPreview(null)} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
