export interface Builder {
  id: string;
  name: string;
  githubUrl: string;
  projectUrl: string;
  description: string;
  tags: string[];
  dateDiscovered: string;
  upvotes: number;
}

export const AVAILABLE_TAGS = [
  "AI", "Infra", "Robotics", "Web", "Mobile", "DevTools",
  "Open Source", "Crypto", "Data", "Security", "Design", "CLI"
] as const;
