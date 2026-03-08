import { useState, useMemo } from "react";
import { Builder } from "@/types/builder";
import { sampleBuilders } from "@/data/sampleBuilders";
import BuilderCard from "@/components/BuilderCard";
import AddBuilderDialog from "@/components/AddBuilderDialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { AVAILABLE_TAGS } from "@/types/builder";

type SortMode = "date" | "upvotes";

const Index = () => {
  const [builders, setBuilders] = useState<Builder[]>(sampleBuilders);
  const [sortMode, setSortMode] = useState<SortMode>("upvotes");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const handleUpvote = (id: string) =>
    setBuilders((prev) =>
      prev.map((b) => (b.id === id ? { ...b, upvotes: b.upvotes + 1 } : b))
    );

  const handleAdd = (builder: Builder) =>
    setBuilders((prev) => [builder, ...prev]);

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

  // "Top builders this week" — top 3 by upvotes
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
