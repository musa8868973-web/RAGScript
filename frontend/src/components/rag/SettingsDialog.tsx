import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getIndexStatus } from "@/lib/api";
import { useStore } from "@/lib/store";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { settings, setSettings, files } = useStore();
  const [draft, setDraft] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  async function test() {
    setTesting(true);
    const r = await getIndexStatus({ settings: { ...draft, demoMode: false }, files });
    setTesting(false);
    if (r.usedDemo) toast.error("Backend unreachable", { description: `No response from ${draft.apiBaseUrl}/status` });
    else toast.success("Backend connected", { description: `${r.files} files · ${r.chunks} chunks indexed` });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>API keys live only in the backend .env — never here.</DialogDescription>
        </DialogHeader>
        <form
          id="settings-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSettings({ ...draft, apiBaseUrl: draft.apiBaseUrl.trim() || DEFAULT_SETTINGS.apiBaseUrl, model: draft.model.trim() || DEFAULT_SETTINGS.model });
            toast.success("Settings saved");
            onOpenChange(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="api">API base URL</Label>
            <div className="flex gap-2">
              <Input id="api" value={draft.apiBaseUrl} onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })} />
              <Button type="button" variant="outline" onClick={test} disabled={testing}>
                {testing ? "Testing…" : "Test"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model name</Label>
            <Input id="model" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label htmlFor="topk">Chunks to retrieve</Label>
              <span className="font-mono text-sm">{draft.topK}</span>
            </div>
            <Slider id="topk" min={1} max={10} step={1} value={[draft.topK]} onValueChange={([v]) => setDraft({ ...draft, topK: v ?? draft.topK })} aria-label="Chunks to retrieve" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="demo">Demo Mode</Label>
              <p className="text-xs text-muted-foreground">Answer locally from your uploaded files. Also used automatically when the backend is unreachable.</p>
            </div>
            <Switch id="demo" checked={draft.demoMode} onCheckedChange={(v) => setDraft({ ...draft, demoMode: v })} />
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Reset defaults
          </Button>
          <Button type="submit" form="settings-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
