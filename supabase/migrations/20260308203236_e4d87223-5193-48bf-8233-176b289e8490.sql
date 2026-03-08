
-- Drop restrictive policies
DROP POLICY "Anyone can submit a builder" ON public.builders;
DROP POLICY "Anyone can update builders" ON public.builders;
DROP POLICY "Builders are viewable by everyone" ON public.builders;

-- Recreate as permissive (default)
CREATE POLICY "Builders are viewable by everyone"
  ON public.builders FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can submit a builder"
  ON public.builders FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update builders"
  ON public.builders FOR UPDATE TO anon, authenticated
  USING (true);
