import { useState, useMemo, useEffect } from "react";
import { Builder } from "@/types/builder";
import { supabase } from "@/integrations/supabase/client";
import BuilderCard from "@/components/BuilderCard";
import AddBuilderDialog from "@/components/AddBuilderDialog";
import TrendingRepos, { TrendingRepo } from "@/components/TrendingRepos";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, RefreshCw, Search, Trophy } from "lucide-react";
import { AVAILABLE_TAGS } from "@/types/builder";
import { toast } from "sonner";

type SortMode = "score" | "commits" | "date";

const mapBuilder = (b: any): Builder => ({
  id: b.id,
  name: b.name,
  githubUrl: b.github_url || "",
  projectUrl: b.project_url || "",
  description: b.description || "",
  tags: b.tags || [],
  dateDiscovered: b.date_discovered,
  commitsPerWeek: b.commits_per_week || 0,
  score: b.score || 0,
});

const Index = () => {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [trendingRepos, setTrendingRepos] = useState<TrendingRepo[]>([]);

  const fetchBuilders = async () => {
    const { data, error } = await supabase.from("builders").select("*");
    if (error) {
      toast.error("Failed to load builders");
      return;
    }
    setBuilders((data || []).map(mapBuilder));
  };

  const refreshCommits = async () => {
    setRefreshing(true);
    try {
      const { data: dbBuilders } = await supabase.from("builders").select("id, github_url");
      if (!dbBuilders?.length) return;

      const { data, error } = await supabase.functions.invoke("github-commits", {
        body: { builders: dbBuilders },
      });

      if (error) {
        toast.error("Failed to refresh commit data");
        return;
      }

      if (data?.results) {
        setBuilders((prev) =>
          prev.map((b) => {
            const updated = data.results.find((r: any) => r.id === b.id);
            return updated ? { ...b, commitsPerWeek: updated.commits_per_week } : b;
          })
        );
      }
      toast.success("Commit data refreshed!");
    } catch {
      toast.error("Failed to refresh commit data");
    } finally {
      setRefreshing(false);
    }
  };

  const discoverBuilders = async () => {
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("discover-builders");

      if (error) {
        toast.error("Failed to discover builders");
        return;
      }

      if (data?.repos) {
        setTrendingRepos(data.repos);
      }

      if (data?.inserted_count > 0) {
        toast.success(`Imported ${data.inserted_count} builders from ${data.repos?.length || 0} trending repos!`);
        fetchBuilders();
      } else {
        toast.info("No new builders found.");
      }
    } catch {
      toast.error("Failed to discover builders");
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    fetchBuilders();
  }, []);

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
    setBuilders((prev) => [mapBuilder(data), ...prev]);
    toast.success("Builder submitted!");
  };

  const nextSort = (current: SortMode): SortMode => {
    const order: SortMode[] = ["score", "commits", "date"];
    return order[(order.indexOf(current) + 1) % order.length];
  };

  const filteredSorted = useMemo(() => {
    let list = activeTag
      ? builders.filter((b) => b.tags.includes(activeTag))
      : builders;
    if (sortMode === "date") {
      list = [...list].sort(
        (a, b) => new Date(b.dateDiscovered).getTime() - new Date(a.dateDiscovered).getTime()
      );
    } else if (sortMode === "commits") {
      list = [...list].sort((a, b) => b.commitsPerWeek - a.commitsPerWeek);
    } else {
      list = [...list].sort((a, b) => b.score - a.score);
    }
    return list;
  }, [builders, sortMode, activeTag]);

  const topBuilders = useMemo(
    () => [...builders].sort((a, b) => b.score - a.score).slice(0, 3),
    [builders]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="Builder Atlas" className="h-10 w-10" />
            <h1 className="font-mono text-lg font-semibold tracking-tight text-foreground">
              Builder Atlas
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={discoverBuilders}
              disabled={discovering}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              <Search className={`h-3.5 w-3.5 ${discovering ? "animate-pulse" : ""}`} />
              {discovering ? "Importing…" : "Import Trending"}
            </button>
            <button
              onClick={refreshCommits}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <AddBuilderDialog onAdd={handleAdd} />
          </div>
        </div>
      </header>

      <main className="container py-8">
        {trendingRepos.length > 0 && (
          <TrendingRepos repos={trendingRepos} />
        )}

        {/* Emerging Builders This Week */}
        <section className="mb-10">
          <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            🚀 Emerging Builders This Week
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {topBuilders.map((builder, i) => (
              <div
                key={builder.id}
                className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-lg font-bold text-primary">#{i + 1}</span>
                  <span className="font-semibold text-foreground">{builder.name}</span>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-primary font-medium">
                    <Trophy className="h-3 w-3" /> {builder.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{builder.description}</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {builder.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] border-0 uppercase tracking-wider">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Filters & Sort */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSortMode(nextSort(sortMode))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <ArrowUpDown className="h-3 w-3" />
              by {sortMode}
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
              No builders found. Click "Import Trending" to discover builders from GitHub.
            </div>
          ) : (
            filteredSorted.map((builder, i) => (
              <BuilderCard
                key={builder.id}
                builder={builder}
                index={i + 1}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
