import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileUp, FolderUp, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { SAMPLE_FILES } from "@/lib/sample-project";
import { useStore } from "@/lib/store";
import { ACCEPT, fromDataTransfer, fromFileList, readPicked, type PickedFile, type UploadItem } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function UploadZone() {
  const { addFiles, progress } = useStore();
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const busy = items.some((i) => i.state === "reading") || !!progress;

  async function ingest(picked: PickedFile[]) {
    if (!picked.length) return;
    const { files, rejected, large } = await readPicked(picked, setItems);
    if (large.length)
      toast.warning(`${large.length} large file${large.length > 1 ? "s" : ""} (over 5 MB)`, {
        description: "Large files may take longer than 15 seconds to index.",
      });
    if (rejected.length)
      toast.info(`Skipped ${rejected.length} file${rejected.length > 1 ? "s" : ""}`, {
        description: "Only .py, .cpp, .h, .hpp, .c, .java, .js, .ts, .md and .txt text files are supported.",
      });
    if (files.length) addFiles(files);
    else if (!rejected.length) toast.error("No files found");
    setTimeout(() => setItems((cur) => cur.filter((i) => i.state === "reading")), 4000);
  }

  return (
    <div className="space-y-2">
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Drop code files or folders here, or press Enter to pick files"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileRef.current?.click())}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          await ingest(await fromDataTransfer(e.dataTransfer));
        }}
        animate={{ scale: over ? 1.02 : 1 }}
        className={cn(
          "cursor-pointer rounded-lg border border-dashed p-4 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          over ? "border-primary bg-primary/10" : "hover:border-primary/60 hover:bg-accent/40",
        )}
      >
        <FileUp className="mx-auto mb-1.5 size-5 text-primary" aria-hidden />
        <p className="font-medium">Drop files or folders</p>
        <p className="text-xs text-muted-foreground">.py .cpp .h .hpp .c .java .js .ts .md .txt</p>
      </motion.div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="h-10" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp /> Files
        </Button>
        <Button variant="outline" size="sm" className="h-10" onClick={() => dirRef.current?.click()} disabled={busy}>
          <FolderUp /> Folder
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-10 w-full text-xs text-muted-foreground"
        disabled={busy}
        onClick={() => addFiles(SAMPLE_FILES)}
      >
        Load sample project (tinyengine)
      </Button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void ingest(fromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={dirRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files) void ingest(fromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-surface p-2"
            aria-label="Upload progress"
          >
            {items.map((i) => (
              <li key={i.path} className="text-xs">
                <div className="flex items-center gap-1.5">
                  {i.state === "reading" && <Loader2 className="size-3 shrink-0 animate-spin text-primary" />}
                  {i.state === "done" && <CheckCircle2 className="size-3 shrink-0 text-success" />}
                  {i.state === "rejected" && <XCircle className="size-3 shrink-0 text-destructive" />}
                  <span className="min-w-0 flex-1 truncate font-mono">{i.path}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(i.size)}</span>
                </div>
                {i.state === "reading" && (
                  <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                    <motion.div className="h-full bg-gradient-accent" animate={{ width: `${i.progress * 100}%` }} />
                  </div>
                )}
                {i.reason && <p className="pl-4 text-muted-foreground">{i.reason}</p>}
                {i.large && i.state !== "rejected" && (
                  <p className="flex items-center gap-1 pl-4 text-warning">
                    <AlertTriangle className="size-3" /> Large files may take longer than 15 seconds to index
                  </p>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
