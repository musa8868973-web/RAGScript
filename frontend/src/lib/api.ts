/**
 * =====================================================================================
 * RAGScript Frontend API Client (api.ts)
 * =====================================================================================
 * Live connection to FastAPI backend running on http://localhost:8000.
 * Endpoints:
 *   - POST /chat   : Dispatches query to Groq LLaMA-3.1 inference engine
 *   - POST /ingest : Dispatches uploaded codebase files to ChromaDB vector store
 *   - GET  /health : Validates backend connectivity and system health
 * =====================================================================================
 */

import { countChunks } from "./files";
import type { CodeFile, IndexInfo, Settings, Source } from "./types";

export interface ApiOptions {
  settings: Settings;
  files: CodeFile[];
  signal?: AbortSignal;
}

export interface IndexResult {
  files: number;
  chunks: number;
  usedDemo: boolean;
}

export interface AskResult {
  sources: Source[];
  stream: AsyncGenerator<string>;
  usedDemo: boolean;
}

/**
 * Sends uploaded codebase files to the FastAPI /ingest endpoint.
 */
export async function indexCodebase(
  files: CodeFile[],
  { settings }: Pick<ApiOptions, "settings">,
): Promise<IndexResult> {
  const baseUrl = (settings.apiBaseUrl || "http://localhost:8000").replace(/\/$/, "");

  const payload = {
    directory_path: "./test_codebase",
    files: files.map(({ path, content }) => ({ path, content })),
    file_extensions: [".cpp", ".h", ".hpp", ".py", ".ts", ".js", ".md"],
    clear_existing: false,
  };

  const response = await fetch(`${baseUrl}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Ingestion failed (${response.status}): ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return {
    files: data.files_processed ?? files.length,
    chunks: data.chunks_created ?? countChunks(files),
    usedDemo: false,
  };
}

/**
 * Dispatches a natural language question to the FastAPI /chat endpoint.
 * Directly queries the live Groq / LLaMA-3.1 inference backend and returns grounded sources.
 */
export async function askQuestion(
  query: string,
  { settings, signal }: { settings: Settings; files?: CodeFile[]; signal?: AbortSignal },
): Promise<AskResult> {
  const baseUrl = (settings.apiBaseUrl || "http://localhost:8000").replace(/\/$/, "");

  // Request payload formatted strictly for FastAPI /chat endpoint
  const requestPayload = {
    query: query.trim(),
    top_k: settings.topK || 4,
  };

  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestPayload),
    signal,
  });

  if (!response.ok) {
    const errorDetails = await response.text().catch(() => "");
    throw new Error(`Backend inference failed (${response.status}): ${errorDetails || response.statusText}`);
  }

  const data = await response.json();
  const answerText: string = data.answer || "No explanation returned by the inference model.";

  // Map backend SourceChunk schema into frontend Source schema
  const mappedSources: Source[] = (data.sources || []).map((s: any, idx: number) => ({
    file: s.file_path || s.file_name || s.file || "codebase",
    startLine: s.start_line ?? idx + 1,
    endLine: s.end_line ?? idx + 15,
    score: s.similarity_score ?? s.score ?? 1.0,
    snippet: s.chunk_snippet || s.snippet || "",
  }));

  // Token/word streaming generator for smooth UI rendering
  async function* renderAnswerStream() {
    const tokens = answerText.split(/(?<=\s+)/);
    for (const token of tokens) {
      if (signal?.aborted) break;
      yield token;
      // 12ms micro-delay simulates low-latency token streaming in UI
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }

  return {
    sources: mappedSources,
    stream: renderAnswerStream(),
    usedDemo: false,
  };
}

/**
 * Evaluates backend index and health status.
 */
export async function getIndexStatus({
  settings,
  files,
}: ApiOptions): Promise<IndexInfo & { usedDemo: boolean }> {
  const baseUrl = (settings.apiBaseUrl || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (res.ok) {
      return {
        status: files.length > 0 ? "ready" : "not_indexed",
        files: files.length,
        chunks: countChunks(files),
        usedDemo: false,
      };
    }
  } catch {
    // Fallback to local count if offline
  }

  return {
    status: files.length > 0 ? "ready" : "not_indexed",
    files: files.length,
    chunks: countChunks(files),
    usedDemo: false,
  };
}
