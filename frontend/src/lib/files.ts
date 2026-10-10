import type { CodeFile } from "./types";

const LANG: Record<string, string> = {
  py: "python", cpp: "cpp", cc: "cpp", cxx: "cpp", h: "cpp", hpp: "cpp", hh: "cpp", c: "c",
  java: "java", js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript",
  md: "markdown", txt: "text", go: "go", rs: "rust", rb: "ruby", php: "php", cs: "csharp",
  kt: "kotlin", swift: "swift", json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
  sh: "bash", sql: "sql", html: "markup", css: "css", scss: "scss", cmake: "cmake",
};

export const SUPPORTED_EXTENSIONS = Object.keys(LANG);
export const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const IGNORED_DIRS = ["node_modules/", ".git/", "dist/", "build/", "__pycache__/", ".venv/"];

export const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
export const languageFor = (path: string) => LANG[extOf(path)] ?? "text";
export const isSupported = (path: string) =>
  extOf(path) in LANG || /(^|\/)(Makefile|Dockerfile|README)$/i.test(path);
export const isIgnoredPath = (path: string) => IGNORED_DIRS.some((d) => path.includes(d));

export function looksBinary(text: string) {
  const sample = text.slice(0, 8000);
  if (sample.includes("\u0000")) return true;
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0xfffd || (c < 9 && c !== 0)) weird++;
  }
  return sample.length > 0 && weird / sample.length > 0.1;
}

export interface Chunk {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** Split a file into overlapping line windows. Line numbers are 1-indexed and inclusive. */
export function chunkFile(file: Pick<CodeFile, "path" | "content">, size = 30, overlap = 8): Chunk[] {
  const lines = file.content.split("\n");
  const chunks: Chunk[] = [];
  const step = Math.max(1, size - overlap);
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + size);
    const text = lines.slice(start, end).join("\n");
    if (text.trim()) chunks.push({ file: file.path, startLine: start + 1, endLine: end, text });
    if (end >= lines.length) break;
  }
  return chunks;
}

export const countChunks = (files: CodeFile[]) =>
  files.reduce((n, f) => n + chunkFile(f).length, 0);

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

export function buildTree(files: CodeFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      node.children ??= [];
      let child = node.children.find((c) => c.name === part && !!c.children === !isFile);
      if (!child) {
        child = isFile ? { name: part, path } : { name: part, path, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (!!b.children === !!a.children ? a.name.localeCompare(b.name) : b.children ? 1 : -1));
    nodes.forEach((n) => n.children && sort(n.children));
    return nodes;
  };
  return sort(root.children ?? []);
}
