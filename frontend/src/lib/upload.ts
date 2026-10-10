import { isIgnoredPath, isSupported, languageFor, LARGE_FILE_BYTES, looksBinary } from "./files";
import type { CodeFile } from "./types";

export interface PickedFile {
  file: File;
  path: string;
}

export interface UploadItem {
  path: string;
  size: number;
  progress: number; // 0-1
  state: "reading" | "done" | "rejected";
  reason?: string;
  large?: boolean;
}

export const ACCEPT = ".py,.cpp,.h,.hpp,.c,.java,.js,.ts,.md,.txt";

export function fromFileList(list: FileList | File[]): PickedFile[] {
  return Array.from(list).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (e: Entry[]) => void, err: (e: unknown) => void) => void };
};

async function walk(entry: Entry, out: PickedFile[]) {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.push({ file, path: entry.fullPath.replace(/^\//, "") });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    let batch: Entry[];
    do {
      batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
      for (const e of batch) await walk(e, out);
    } while (batch.length);
  }
}

/** Collect files from a drop event, descending into dropped folders. */
export async function fromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items)
    .map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.())
    .filter(Boolean) as Entry[];
  if (!entries.length) return fromFileList(dt.files);
  const out: PickedFile[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}

function readText(file: File, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export async function readPicked(
  picked: PickedFile[],
  onUpdate: (items: UploadItem[]) => void,
): Promise<{ files: CodeFile[]; rejected: UploadItem[]; large: UploadItem[] }> {
  const relevant = picked.filter((p) => !isIgnoredPath(p.path));
  const items: UploadItem[] = relevant.map((p) => ({
    path: p.path,
    size: p.file.size,
    progress: 0,
    state: "reading",
    large: p.file.size > LARGE_FILE_BYTES,
  }));
  const emit = () => onUpdate(items.map((i) => ({ ...i })));
  emit();
  const files: CodeFile[] = [];
  for (let i = 0; i < relevant.length; i++) {
    const { file, path } = relevant[i]!;
    const item = items[i]!;
    if (!isSupported(path)) {
      Object.assign(item, { state: "rejected", reason: "Unsupported file type" });
      emit();
      continue;
    }
    try {
      const content = await readText(file, (p) => {
        item.progress = p;
        emit();
      });
      if (looksBinary(content)) {
        Object.assign(item, { state: "rejected", reason: "Looks like a binary file" });
      } else {
        files.push({ path, content, size: file.size, language: languageFor(path) });
        Object.assign(item, { state: "done", progress: 1 });
      }
    } catch {
      Object.assign(item, { state: "rejected", reason: "Couldn't read file" });
    }
    emit();
  }
  return { files, rejected: items.filter((i) => i.state === "rejected"), large: items.filter((i) => i.large) };
}
