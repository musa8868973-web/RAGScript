import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { indexCodebase } from "./api";
import { countChunks } from "./files";
import { DEFAULT_SETTINGS, uid, type Chat, type CodeFile, type IndexInfo, type Settings } from "./types";

const KEY = "ragscript:v1";
export type Theme = "dark" | "light";

export interface IndexProgress {
  step: number; // 0 reading, 1 chunking, 2 embedding, 3 stored, 4 done
  filesRead: number;
  chunks: number;
  embedded: number;
  totalFiles: number;
  totalChunks: number;
}

interface Persisted {
  files: CodeFile[];
  chats: Chat[];
  settings: Settings;
  index: IndexInfo;
}

interface Store extends Persisted {
  hydrated: boolean;
  theme: Theme;
  progress: IndexProgress | null;
  addFiles: (files: CodeFile[]) => void;
  clearFiles: () => void;
  createChat: () => string;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  clearChats: () => void;
  updateChat: (id: string, fn: (c: Chat) => Chat) => void;
  setSettings: (s: Settings) => void;
  toggleTheme: () => void;
}

// Keep one context instance across hot reloads; otherwise a re-evaluated module
// creates a new context that the already-mounted provider doesn't supply.
const g = globalThis as { __ragscriptStoreCtx?: React.Context<Store | null> };
const Ctx = (g.__ragscriptStoreCtx ??= createContext<Store | null>(null));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [index, setIndex] = useState<IndexInfo>({ status: "not_indexed", files: 0, chunks: 0 });
  const [theme, setTheme] = useState<Theme>("dark");
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const warned = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        setFiles(p.files ?? []);
        setChats(p.chats ?? []);
        setSettingsState({ ...DEFAULT_SETTINGS, ...p.settings, demoMode: false });
        const idx = p.index ?? { status: "not_indexed", files: 0, chunks: 0 };
        setIndex(idx.status === "indexing" ? { ...idx, status: p.files?.length ? "ready" : "not_indexed" } : idx);
      }
      setTheme((localStorage.getItem("ragscript:theme") as Theme) || "dark");
    } catch {
      toast.error("Couldn't restore saved data", { description: "Starting fresh." });
    }
    setHydrated(true);
  }, []);

  const lastSave = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    const wait = Math.max(0, 300 - (Date.now() - lastSave.current));
    const t = setTimeout(() => {
      lastSave.current = Date.now();
      try {
        localStorage.setItem(KEY, JSON.stringify({ files, chats, settings, index }));
      } catch {
        if (!warned.current) {
          warned.current = true;
          toast.warning("Browser storage is full", {
            description: "Your codebase is too large to save locally; it will be lost on reload.",
          });
        }
      }
    }, wait);
    return () => clearTimeout(t);
  }, [files, chats, settings, index, hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (hydrated) localStorage.setItem("ragscript:theme", theme);
  }, [theme, hydrated]);

  const runIndexing = useCallback(async (all: CodeFile[], added: CodeFile[]) => {
    const totalChunks = countChunks(all);
    const p: IndexProgress = { step: 0, filesRead: 0, chunks: 0, embedded: 0, totalFiles: all.length, totalChunks };
    setIndex((i) => ({ ...i, status: "indexing" }));
    setProgress({ ...p });
    const ticks = 12;
    for (let i = 1; i <= ticks; i++) {
      await sleep(60);
      setProgress({ ...p, filesRead: Math.round((all.length * i) / ticks) });
    }
    for (let i = 1; i <= ticks; i++) {
      await sleep(60);
      setProgress({ ...p, step: 1, filesRead: all.length, chunks: Math.round((totalChunks * i) / ticks) });
    }
    try {
      const apiCall = indexCodebase(added.length ? all : all, { settings: settingsRef.current });
      for (let i = 1; i <= ticks; i++) {
        await sleep(80);
        setProgress({ ...p, step: 2, filesRead: all.length, chunks: totalChunks, embedded: Math.round((totalChunks * i) / ticks) });
      }
      const result = await apiCall;
      setProgress({ ...p, step: 3, filesRead: all.length, chunks: totalChunks, embedded: totalChunks });
      await sleep(500);
      setIndex({ status: "ready", files: result.files, chunks: result.chunks, indexedAt: Date.now() });
      setProgress({ ...p, step: 4, filesRead: all.length, chunks: totalChunks, embedded: totalChunks });
      if (!settingsRef.current.demoMode && result.usedDemo)
        toast.warning("Backend unreachable — indexed locally", {
          description: "Answers will use Demo Mode until the backend is available.",
        });
      else toast.success("Codebase indexed", { description: `${result.files} files · ${result.chunks} chunks` });
      await sleep(1400);
      setProgress(null);
    } catch (e) {
      setIndex((i) => ({ ...i, status: all.length ? "ready" : "not_indexed" }));
      setProgress(null);
      toast.error("Indexing failed", { description: (e as Error).message });
    }
  }, []);

  const addFiles = useCallback(
    (incoming: CodeFile[]) => {
      setFiles((prev) => {
        const map = new Map(prev.map((f) => [f.path, f]));
        incoming.forEach((f) => map.set(f.path, f));
        const all = [...map.values()];
        void runIndexing(all, incoming);
        return all;
      });
    },
    [runIndexing],
  );

  const createChat = useCallback(() => {
    const id = uid();
    setChats((c) => [{ id, title: "New chat", messages: [], updatedAt: Date.now() }, ...c]);
    return id;
  }, []);

  const store: Store = {
    hydrated, files, chats, settings, index, theme, progress,
    addFiles,
    clearFiles: () => {
      setFiles([]);
      setIndex({ status: "not_indexed", files: 0, chunks: 0 });
    },
    createChat,
    renameChat: (id, title) => setChats((c) => c.map((x) => (x.id === id ? { ...x, title } : x))),
    deleteChat: (id) => setChats((c) => c.filter((x) => x.id !== id)),
    clearChats: () => setChats([]),
    updateChat: (id, fn) => setChats((c) => c.map((x) => (x.id === id ? { ...fn(x), updatedAt: Date.now() } : x))),
    setSettings: setSettingsState,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
