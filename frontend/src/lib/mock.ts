import { chunkFile, languageFor, type Chunk } from "./files";
import type { CodeFile, Source } from "./types";

const STOP = new Set(
  "the a an and or of to in on for with how what which does do is are this that it from by be as at explain show me tell about can you where why when who all any into module code file files function summarize".split(
    " ",
  ),
);

export function tokenize(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9_.]+/g, " ")
        .split(/\s+/)
        .flatMap((w) => [w, ...w.split(/[._]/)])
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  );
}

function mentionedFiles(query: string, files: CodeFile[]) {
  const q = query.toLowerCase();
  return files.filter((f) => {
    const base = f.path.split("/").pop()!.toLowerCase();
    return q.includes(base) || q.includes(base.replace(/\.[^.]+$/, ""));
  });
}

/** Keyword-based retrieval over the uploaded files. Returns at most topK real chunks. */
export function retrieve(query: string, files: CodeFile[], topK: number): Source[] {
  const terms = tokenize(query);
  const mentioned = new Set(mentionedFiles(query, files).map((f) => f.path));
  const chunks: Chunk[] = files.flatMap((f) => chunkFile(f));
  const scored = chunks.map((c) => {
    const text = c.text.toLowerCase();
    let s = 0;
    for (const t of terms) {
      const hits = text.split(t).length - 1;
      if (hits) s += 1 + Math.log2(1 + hits);
    }
    if (mentioned.has(c.file)) s += 3;
    return { c, s };
  });
  let ranked = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!ranked.length) ranked = scored.slice(0, topK).map((x) => ({ ...x, s: 0.4 }));
  const top = ranked.slice(0, Math.max(1, Math.min(10, topK)));
  const max = Math.max(...top.map((x) => x.s), 1);
  return top.map(({ c, s }) => ({
    file: c.file,
    startLine: c.startLine,
    endLine: c.endLine,
    score: Math.round(Math.min(0.99, 0.35 + 0.6 * (s / max)) * 100) / 100,
    snippet: c.text,
  }));
}

function definitions(text: string) {
  const re =
    /(?:^|\n)\s*(?:export\s+)?(?:class|struct|def|function|interface|enum|async\s+def)\s+([A-Za-z_]\w*)|(?:^|\n)[\w:<>*&\s]+?\s([A-Za-z_][\w:]*)\s*\([^;{)]*\)\s*(?:const\s*)?\{/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1] ?? m[2];
    if (name && !["if", "for", "while", "switch", "return"].includes(name)) out.add(name);
  }
  return [...out].slice(0, 6);
}

function inheritors(base: string, files: CodeFile[]) {
  const res: { cls: string; file: string; line: number }[] = [];
  const re = new RegExp(
    `class\\s+(\\w+)\\s*(?:\\(([^)]*\\b${base}\\b[^)]*)\\)|:\\s*(?:public|protected|private)?\\s*${base}\\b|extends\\s+${base}\\b)`,
    "g",
  );
  for (const f of files) {
    const lines = f.content.split("\n");
    lines.forEach((l, i) => {
      re.lastIndex = 0;
      const m = re.exec(l);
      if (m) res.push({ cls: m[1] ?? "", file: f.path, line: i + 1 });
    });
  }
  return res;
}

const cite = (s: Source) => `\`${s.file.split("/").pop()}:${s.startLine}-${s.endLine}\``;

export function composeAnswer(query: string, sources: Source[], files: CodeFile[]): string {
  if (!files.length) {
    return "I don't have any indexed code yet. Upload files or load the sample project from the sidebar, then ask again.";
  }
  const q = query.toLowerCase();
  const top = sources[0];
  const parts: string[] = [];

  const inheritMatch = query.match(/inherit\w*\s+from\s+`?(\w+)`?/i) ?? query.match(/subclass\w*\s+of\s+`?(\w+)`?/i);
  if (inheritMatch) {
    const base = inheritMatch[1] ?? "";
    const found = inheritors(base, files);
    if (found.length) {
      parts.push(`I found **${found.length}** class${found.length > 1 ? "es" : ""} inheriting from \`${base}\`:`);
      parts.push(found.map((f) => `- \`${f.cls}\` — \`${f.file}:${f.line}\``).join("\n"));
    } else {
      parts.push(`I couldn't find any class that inherits from \`${base}\` in the indexed files. The closest matches are below.`);
    }
  } else if (/summar|overview|what (does|is) this/.test(q)) {
    const byFile = new Map<string, string[]>();
    for (const f of files.slice(0, 8)) byFile.set(f.path, definitions(f.content));
    parts.push(`## Summary\nThis codebase contains **${files.length}** indexed file${files.length > 1 ? "s" : ""}. Here's what each part is responsible for:`);
    parts.push(
      [...byFile.entries()]
        .map(([p, defs]) => `- \`${p}\`${defs.length ? ` — defines ${defs.map((d) => `\`${d}\``).join(", ")}` : ""}`)
        .join("\n"),
    );
  } else if (top) {
    const defs = top ? definitions(top.snippet) : [];
    parts.push(
      `The most relevant code is in \`${top.file}\` (lines ${top.startLine}–${top.endLine})` +
        (defs.length ? `, which defines ${defs.map((d) => `\`${d}\``).join(", ")}.` : "."),
    );
    const terms = tokenize(query).slice(0, 4);
    if (terms.length)
      parts.push(
        `Looking for ${terms.map((t) => `**${t}**`).join(", ")} across the index, here is how the pieces fit together:`,
      );
    parts.push(
      sources
        .slice(0, 4)
        .map((s, i) => {
          const d = definitions(s.snippet);
          return `${i + 1}. ${cite(s)} — ${d.length ? `contains ${d.map((x) => `\`${x}\``).join(", ")}` : "supporting logic"} (relevance ${Math.round(s.score * 100)}%).`;
        })
        .join("\n"),
    );
  }

  if (top) {
    const lines = top.snippet.split("\n");
    const excerpt = lines.slice(0, 18).join("\n");
    parts.push(`### Key excerpt — ${cite(top)}\n\`\`\`${languageFor(top.file)}\n${excerpt}${lines.length > 18 ? "\n// …" : ""}\n\`\`\``);
  }
  parts.push(
    "_Demo Mode answer: generated locally by keyword retrieval over your uploaded files. Connect the backend for Groq-powered explanations._",
  );
  return parts.join("\n\n");
}

export async function* streamText(text: string, signal?: AbortSignal) {
  const tokens = text.match(/\s*\S+/g) ?? [];
  for (let i = 0; i < tokens.length; i += 2) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 22));
    yield tokens.slice(i, i + 2).join("");
  }
}
