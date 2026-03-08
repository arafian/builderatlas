ALTER TABLE public.builders ADD COLUMN commits_per_week integer NOT NULL DEFAULT 0;
ALTER TABLE public.builders ADD COLUMN commits_updated_at timestamp with time zone;