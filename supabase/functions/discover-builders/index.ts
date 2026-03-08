const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use public events API - no auth needed, higher rate limit
    const commitCounts: Record<string, { username: string; commits: number }> = {};

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
      if (!res.ok) {
        console.error(`Events API page ${page}: ${res.status}`);
        break;
      }
      const events = await res.json();
      if (!events.length) break;

      for (const event of events) {
        if (event.type !== 'PushEvent') continue;

        const username = event.actor?.login;
        if (!username || username.includes('[bot]') || username.endsWith('-bot')) continue;

        const numCommits = event.payload?.size || event.payload?.commits?.length || 0;
        if (numCommits === 0) continue;

        if (!commitCounts[username]) {
          commitCounts[username] = { username, commits: 0 };
        }
        commitCounts[username].commits += numCommits;
      }
    }

    console.log(`Found ${Object.keys(commitCounts).length} unique committers`);

    // Sort by commits and take top 5
    const topUsers = Object.values(commitCounts)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 5);

    console.log('Top users:', JSON.stringify(topUsers));

    if (topUsers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, top_users: [], inserted_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For each top user, get their real weekly commit count from their profile events
    for (const user of topUsers) {
      try {
        const eventsRes = await fetch(
          `https://api.github.com/users/${user.username}/events/public?per_page=100`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'BuilderAtlas',
            },
          }
        );
        if (eventsRes.ok) {
          const events = await eventsRes.json();
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          let realCommits = 0;
          for (const event of events) {
            if (event.type === 'PushEvent' && new Date(event.created_at) >= oneWeekAgo) {
              realCommits += event.payload?.size || event.payload?.commits?.length || 0;
            }
          }
          user.commits = Math.max(user.commits, realCommits);
        }
      } catch { /* keep original count */ }
    }

    topUsers.sort((a, b) => b.commits - a.commits);

    // Insert into database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const headers = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    const inserted = [];
    for (const user of topUsers) {
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/builders?github_url=eq.https://github.com/${user.username}&select=id`,
        { headers }
      );
      const existing = await checkRes.json();

      if (existing.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/builders?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            commits_per_week: user.commits,
            commits_updated_at: new Date().toISOString(),
          }),
        });
        continue;
      }

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/builders`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
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
