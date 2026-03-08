const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch multiple pages of public GitHub events to find top committers
    const commitCounts: Record<string, { username: string; commits: number; avatar: string }> = {};
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch several pages of public events
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `https://api.github.com/events?per_page=100&page=${page}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'BuilderAtlas',
          },
        }
      );
      if (!res.ok) break;
      const events = await res.json();
      if (!events.length) break;

      for (const event of events) {
        if (event.type !== 'PushEvent') continue;
        if (new Date(event.created_at) < oneWeekAgo) continue;

        const username = event.actor?.login;
        if (!username || username.includes('[bot]') || username.endsWith('-bot')) continue;

        const numCommits = event.payload?.commits?.length || 0;
        if (!commitCounts[username]) {
          commitCounts[username] = {
            username,
            commits: 0,
            avatar: event.actor?.avatar_url || '',
          };
        }
        commitCounts[username].commits += numCommits;
      }
    }

    // Sort by commits and take top 5
    const topUsers = Object.values(commitCounts)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 5);

    console.log('Top users found:', topUsers.map(u => `${u.username}: ${u.commits}`));

    // Insert into database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const inserted = [];
    for (const user of topUsers) {
      // Check if already exists
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/builders?github_url=eq.https://github.com/${user.username}&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      );
      const existing = await checkRes.json();
      if (existing.length > 0) {
        // Update commits
        await fetch(`${supabaseUrl}/rest/v1/builders?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            commits_per_week: user.commits,
            commits_updated_at: new Date().toISOString(),
          }),
        });
        continue;
      }

      // Insert new builder
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/builders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name: user.username,
          github_url: `https://github.com/${user.username}`,
          description: `Active open-source contributor with ${user.commits} commits this week`,
          tags: ['open-source'],
          commits_per_week: user.commits,
          commits_updated_at: new Date().toISOString(),
        }),
      });

      if (insertRes.ok) {
        const data = await insertRes.json();
        inserted.push(data[0]);
      }
    }

    return new Response(
      JSON.stringify({ success: true, top_users: topUsers, inserted_count: inserted.length }),
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
