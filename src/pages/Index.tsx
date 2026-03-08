import { useState, useMemo, useEffect } from "react";
import { Builder } from "@/types/builder";
import { supabase } from "@/integrations/supabase/client";
import BuilderCard from "@/components/BuilderCard";
import AddBuilderDialog from "@/components/AddBuilderDialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { AVAILABLE_TAGS } from "@/types/builder";
import { toast } from "sonner";

type SortMode = "date" | "upvotes";

const Index = () => {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("upvotes");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    const fetchBuilders = async () => {
      const { data, error } = await supabase
        .from("builders")
        .select("*");
      if (error) {
        toast.error("Failed to load builders");
        return;
      }
      setBuilders(
        (data || []).map((b) => ({
          id: b.id,
          name: b.name,
          githubUrl: b.github_url || "",
          projectUrl: b.project_url || "",
          description: b.description || "",
          tags: b.tags || [],
          dateDiscovered: b.date_discovered,
          upvotes: b.upvotes,
        }))
      );
    };
    fetchBuilders();
  }, []);

  const handleUpvote = async (id: string) => {
    const builder = builders.find((b) => b.id === id);
    if (!builder) return;
    const newUpvotes = builder.upvotes + 1;
    setBuilders((prev) =>
      prev.map((b) => (b.id === id ? { ...b, upvotes: newUpvotes } : b))
    );
    await supabase.from("builders").update({ upvotes: newUpvotes }).eq("id", id);
  };

  const handleAdd = async (builder: Builder) => {
    const { data, error } = await supabase
      .from("builders")
      .insert({
        name: builder.name,
        github_url: builder.githubUrl,
        project_url: builder.projectUrl,
        description: builder.description,
        tags: builder.tags,
        date_discovered: builder.dateDiscovered,
      })
      .select()
      .single();
    if (error) {
      toast.error("Failed to add builder");
      return;
    }
    setBuilders((prev) => [
      {
        id: data.id,
        name: data.name,
        githubUrl: data.github_url || "",
        projectUrl: data.project_url || "",
        description: data.description || "",
        tags: data.tags || [],
        dateDiscovered: data.date_discovered,
        upvotes: data.upvotes,
      },
      ...prev,
    ]);
    toast.success("Builder submitted!");
  };

  const filteredSorted = useMemo(() => {
    let list = activeTag
      ? builders.filter((b) => b.tags.includes(activeTag))
      : builders;
    if (sortMode === "date") {
      list = [...list].sort(
        (a, b) => new Date(b.dateDiscovered).getTime() - new Date(a.dateDiscovered).getTime()
      );
    } else {
      list = [...list].sort((a, b) => b.upvotes - a.upvotes);
    }
    return list;
  }, [builders, sortMode, activeTag]);

  const topThisWeek = useMemo(
    () => [...builders].sort((a, b) => b.upvotes - a.upvotes).slice(0, 3),
    [builders]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="Builder Atlas" className="h-10 w-10" />
            <h1 className="font-mono text-lg font-semibold tracking-tight text-foreground">
              Builder Atlas
            </h1>
          </div>
          <AddBuilderDialog onAdd={handleAdd} />
        </div>
      </header>

      <main className="container py-8">
        {/* Top Builders This Week */}
        <section className="mb-10">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            🔥 Top Builders This Week
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {topThisWeek.map((builder, i) => (
              <div
                key={builder.id}
                className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-lg font-bold text-primary">#{i + 1}</span>
                  <span className="font-semibold text-foreground">{builder.name}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{builder.description}</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {builder.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] border-0 uppercase tracking-wider">
                      {tag}
                    </Badge>
                  ))}
                  <span className="ml-auto font-mono text-xs text-primary font-medium">
                    ▲ {builder.upvotes}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Filters & Sort */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSortMode(sortMode === "date" ? "upvotes" : "date")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortMode === "date" ? "by date" : "by votes"}
            </button>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={activeTag === null ? "default" : "outline"}
              className="cursor-pointer text-[10px] uppercase tracking-wider"
              onClick={() => setActiveTag(null)}
            >
              All
            </Badge>
            {AVAILABLE_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant={activeTag === tag ? "default" : "outline"}
                className="cursor-pointer text-[10px] uppercase tracking-wider"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Builder List */}
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          {filteredSorted.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No builders found for this filter.
            </div>
          ) : (
            filteredSorted.map((builder, i) => (
              <BuilderCard
                key={builder.id}
                builder={builder}
                index={i + 1}
                onUpvote={handleUpvote}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
