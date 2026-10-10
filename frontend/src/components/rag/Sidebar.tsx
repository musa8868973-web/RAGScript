import { AnimatePresence, motion } from "framer-motion";
import { Check, MessageSquare, Pencil, Plus, Settings, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { FileTree } from "./FileTree";
import { IndexingProgress } from "./IndexingProgress";
import { Logo, StatusBadge, ThemeToggle, springTap } from "./primitives";
import { UploadZone } from "./UploadZone";

function Confirm({ title, desc, onConfirm, children }: { title: string; desc: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChatRow({ id, title, active, onSelect }: { id: string; title: string; active: boolean; onSelect: () => void }) {
  const { renameChat, deleteChat } = useStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  const save = () => {
    if (val.trim()) renameChat(id, val.trim());
    setEditing(false);
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }}>
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(false))}
            className="h-9 text-sm"
            aria-label="Chat name"
          />
          <Button type="submit" size="icon" variant="ghost" className="size-9" aria-label="Save name">
            <Check />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-9" aria-label="Cancel rename" onClick={() => setEditing(false)}>
            <X />
          </Button>
        </form>
      ) : (
        <div className={cn("group flex items-center rounded-md", active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}>
          <button
            type="button"
            onClick={onSelect}
            aria-current={active ? "true" : undefined}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{title}</span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            aria-label={`Rename ${title}`}
            onClick={() => {
              setVal(title);
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Confirm title="Delete chat?" desc={`"${title}" will be permanently removed.`} onConfirm={() => deleteChat(id)}>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              aria-label={`Delete ${title}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </Confirm>
        </div>
      )}
    </motion.li>
  );
}

export function Sidebar({
  activeId,
  onSelect,
  onNew,
  onOpenFile,
  onSettings,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenFile: (path: string) => void;
  onSettings: () => void;
}) {
  const { chats, files, index, clearChats, clearFiles } = useStore();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <Logo />
        <StatusBadge status={index.status} />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <section aria-labelledby="sb-code" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="sb-code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Codebase
            </h2>
            {index.status === "ready" && (
              <span className="text-xs text-muted-foreground">
                {index.files} files · {index.chunks} chunks
              </span>
            )}
          </div>
          <UploadZone />
          <IndexingProgress />
        </section>

        <section aria-labelledby="sb-chats" className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 id="sb-chats" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chats
            </h2>
            {chats.length > 0 && (
              <Confirm title="Delete all chats?" desc="Every conversation will be removed." onConfirm={clearChats}>
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  Clear all
                </Button>
              </Confirm>
            )}
          </div>
          <motion.div {...springTap}>
            <Button className="h-10 w-full justify-start" variant="secondary" onClick={onNew}>
              <Plus /> New chat <kbd className="ml-auto text-xs text-muted-foreground">⌘K</kbd>
            </Button>
          </motion.div>
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {chats.map((c) => (
                <ChatRow key={c.id} id={c.id} title={c.title} active={c.id === activeId} onSelect={() => onSelect(c.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <section aria-labelledby="sb-files" className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 id="sb-files" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Files
            </h2>
            {files.length > 0 && (
              <Confirm title="Remove codebase?" desc="All uploaded files and the local index will be cleared." onConfirm={clearFiles}>
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  Remove
                </Button>
              </Confirm>
            )}
          </div>
          <FileTree onOpen={onOpenFile} />
        </section>
      </div>
      <div className="flex items-center gap-1 border-t p-2">
        <Button variant="ghost" className="h-10 flex-1 justify-start" onClick={onSettings}>
          <Settings /> Settings
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
