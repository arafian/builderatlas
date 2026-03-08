import { Builder } from "@/types/builder";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Github, GitCommit } from "lucide-react";

const TAG_COLORS: Record<string, string> = {
  AI: "bg-[hsl(var(--tag-ai))] text-[hsl(var(--tag-ai-foreground))]",
  Infra: "bg-[hsl(var(--tag-infra))] text-[hsl(var(--tag-infra-foreground))]",
  Robotics: "bg-[hsl(var(--tag-robotics))] text-[hsl(var(--tag-robotics-foreground))]",
  Web: "bg-[hsl(var(--tag-web))] text-[hsl(var(--tag-web-foreground))]",
};

const getTagClass = (tag: string) =>
  TAG_COLORS[tag] || "bg-[hsl(var(--tag-default))] text-[hsl(var(--tag-default-foreground))]";

interface BuilderCardProps {
  builder: Builder;
  index: number;
}

const BuilderCard = ({ builder, index }: BuilderCardProps) => {
  return (
    <div className="group flex items-start gap-4 border-b border-border px-4 py-4 transition-colors hover:bg-card">
      {/* Commits badge */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5 text-muted-foreground">
        <GitCommit className="h-4 w-4" />
        <span className="font-mono text-xs font-medium">{builder.commitsPerWeek}</span>
      </div>

      {/* Index */}
      <span className="pt-0.5 font-mono text-sm text-muted-foreground">{index}.</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground">{builder.name}</h3>
          <a
            href={builder.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
          </a>
          <a
            href={builder.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-mono text-xs text-primary transition-colors hover:text-primary/80"
          >
            project <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{builder.description}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {builder.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className={`${getTagClass(tag)} border-0 text-[10px] font-medium uppercase tracking-wider`}
            >
              {tag}
            </Badge>
          ))}
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(builder.dateDiscovered).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BuilderCard;
