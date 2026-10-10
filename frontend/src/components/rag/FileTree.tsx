import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FileCode, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { buildTree, type TreeNode } from "@/lib/files";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Node({ node, depth, onOpen, i }: { node: TreeNode; depth: number; onOpen: (p: string) => void; i: number }) {
  const [open, setOpen] = useState(depth < 2);
  const pad = { paddingLeft: `${depth * 12 + 6}px` };
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.03 }}
      role="treeitem"
      aria-expanded={node.children ? open : undefined}
    >
      <button
        type="button"
        style={pad}
        onClick={() => (node.children ? setOpen(!open) : onOpen(node.path))}
        className="flex min-h-9 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {node.children ? (
          <>
            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
            {open ? <FolderOpen className="size-4 shrink-0 text-primary" /> : <Folder className="size-4 shrink-0 text-primary" />}
          </>
        ) : (
          <FileCode className="ml-5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
      <AnimatePresence initial={false}>
        {node.children && open && (
          <motion.ul
            role="group"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children.map((c, j) => (
              <Node key={c.path} node={c} depth={depth + 1} onOpen={onOpen} i={j} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function FileTree({ onOpen }: { onOpen: (path: string) => void }) {
  const { files } = useStore();
  const tree = useMemo(() => buildTree(files), [files]);
  if (!files.length) return <p className="px-2 text-xs text-muted-foreground">No files loaded yet.</p>;
  return (
    <ul role="tree" aria-label="Codebase files" className="space-y-0.5">
      {tree.map((n, i) => (
        <Node key={n.path} node={n} depth={0} onOpen={onOpen} i={i} />
      ))}
    </ul>
  );
}
