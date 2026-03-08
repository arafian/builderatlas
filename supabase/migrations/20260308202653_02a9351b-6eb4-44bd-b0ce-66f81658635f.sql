
-- Create builders table
CREATE TABLE public.builders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  github_url TEXT DEFAULT '',
  project_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  date_discovered DATE NOT NULL DEFAULT CURRENT_DATE,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.builders ENABLE ROW LEVEL SECURITY;

-- Anyone can read builders
CREATE POLICY "Builders are viewable by everyone"
  ON public.builders FOR SELECT USING (true);

-- Anyone can insert builders (no auth required)
CREATE POLICY "Anyone can submit a builder"
  ON public.builders FOR INSERT WITH CHECK (true);

-- Anyone can update builders (for upvotes)
CREATE POLICY "Anyone can update builders"
  ON public.builders FOR UPDATE USING (true);
