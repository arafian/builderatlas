import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Builder, AVAILABLE_TAGS } from "@/types/builder";

interface AddBuilderDialogProps {
  onAdd: (builder: Builder) => void;
}

const AddBuilderDialog = ({ onAdd }: AddBuilderDialogProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(),
      githubUrl: githubUrl.trim(),
      projectUrl: projectUrl.trim(),
      description: description.trim(),
      tags: selectedTags,
      dateDiscovered: new Date().toISOString().split("T")[0],
      commitsPerWeek: 0,
      score: 0,
    });
    setName("");
    setGithubUrl("");
    setProjectUrl("");
    setDescription("");
    setSelectedTags([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 font-mono text-xs uppercase tracking-wider">
          <Plus className="h-3.5 w-3.5" /> Submit Builder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base uppercase tracking-wider">
            Add a Builder
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Submit a builder you've discovered. GitHub commits will be fetched automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="GitHub URL (e.g. https://github.com/username)" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
          <Input placeholder="Project URL" value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} />
          <Input placeholder="Short description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer text-[10px] uppercase tracking-wider"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <Button type="submit" className="mt-2 font-mono text-xs uppercase tracking-wider">
            Add Builder
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddBuilderDialog;
