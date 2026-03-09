import { Star, ExternalLink } from "lucide-react";

export interface TrendingRepo {
  name: string;
  url: string;
  description: string;
  stars: number;
  language: string | null;
  starsToday?: number;
}

interface TrendingReposProps {
  repos: TrendingRepo[];
}

const TrendingRepos = ({ repos }: TrendingReposProps) => {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
        🚀 Trending Repos This Week
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {repos.map((repo) => (
          <a
            key={repo.name}
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {repo.name}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {repo.description || "No description"}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono font-medium text-primary">
                <Star className="h-3 w-3" /> {repo.stars.toLocaleString()}
              </span>
              {repo.starsToday ? (
                <span className="font-mono text-primary/70">+{repo.starsToday.toLocaleString()} today</span>
              ) : null}
              {repo.language && (
                <span className="font-mono">{repo.language}</span>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default TrendingRepos;
