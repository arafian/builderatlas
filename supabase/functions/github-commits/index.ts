const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractUsername(githubUrl: string): string | null {
  try {
    const url = new URL(githubUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { builders } = await req.json();

    if (!Array.isArray(builders) || builders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { id: string; commits_per_week: number }[] = [];

    for (const builder of builders) {
      const username = extractUsername(builder.github_url || '');
      if (!username) {
        results.push({ id: builder.id, commits_per_week: 0 });
        continue;
      }

      try {
        // Fetch public events for the user
        const response = await fetch(
          `https://api.github.com/users/${username}/events/public?per_page=100`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'BuilderAtlas',
            },
          }
        );

        if (!response.ok) {
          console.error(`GitHub API error for ${username}: ${response.status}`);
          results.push({ id: builder.id, commits_per_week: 0 });
          continue;
        }

        const events = await response.json();
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        let commitCount = 0;
        for (const event of events) {
          if (event.type === 'PushEvent' && new Date(event.created_at) >= oneWeekAgo) {
            commitCount += event.payload?.commits?.length || 0;
          }
        }

        results.push({ id: builder.id, commits_per_week: commitCount });
      } catch (err) {
        console.error(`Error fetching commits for ${username}:`, err);
        results.push({ id: builder.id, commits_per_week: 0 });
      }
    }

    // Update the database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    for (const result of results) {
      await fetch(`${supabaseUrl}/rest/v1/builders?id=eq.${result.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          commits_per_week: result.commits_per_week,
          commits_updated_at: new Date().toISOString(),
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
