export interface CodeFile {
  path: string;
  content: string;
  size: number;
  language: string;
}

export interface Source {
  file: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export type Feedback = "up" | "down" | null;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  feedback?: Feedback;
  error?: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface Settings {
  apiBaseUrl: string;
  model: string;
  topK: number;
  demoMode: boolean;
}

export type IndexStatus = "not_indexed" | "indexing" | "ready";

export interface IndexInfo {
  status: IndexStatus;
  files: number;
  chunks: number;
  indexedAt?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: "http://localhost:8000",
  model: "llama-3.1-8b-instant",
  topK: 4,
  demoMode: false,
};

export const sourceKey = (s: Pick<Source, "file" | "startLine" | "endLine">) =>
  `${s.file}:${s.startLine}-${s.endLine}`;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
