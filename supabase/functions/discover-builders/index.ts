const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = oneWeekAgo.toISOString().split('T')[0];

    // Use GitHub Search Commits API to find recent commits
    // Search across popular repos to find active committers
    const commitCounts: Record<string, { username: string; commits: number }> = {};

    // Fetch a few pages of recent commits
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/search/commits?q=committer-date:>${dateStr}&sort=committer-date&order=desc&per_page=100&page=${page}`,
        {
          headers: {
            'Accept': 'application/vnd.github.cloak-preview+json',
            'User-Agent': 'BuilderAtlas',
          },
        }
      );

      if (!res.ok) {
        console.error(`GitHub search API error: ${res.status} ${await res.text()}`);
        break;
      }

      const data = await res.json();
      if (!data.items?.length) break;

      for (const item of data.items) {
        const username = item.author?.login;
        if (!username) continue;
        if (username.includes('[bot]') || username.endsWith('-bot') || username.includes('bot')) continue;

        if (!commitCounts[username]) {
          commitCounts[username] = { username, commits: 0 };
        }
        commitCounts[username].commits += 1;
      }
    }

    // Sort by commits and take top 5
    const topUsers = Object.values(commitCounts)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 5);

    console.log('Top users found:', JSON.stringify(topUsers));

    if (topUsers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, top_users: [], inserted_count: 0, message: 'No active committers found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now fetch real commit counts for each user from their events
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
          let realCommits = 0;
          for (const event of events) {
            if (event.type === 'PushEvent' && new Date(event.created_at) >= oneWeekAgo) {
              realCommits += event.payload?.commits?.length || 0;
            }
          }
          if (realCommits > user.commits) {
            user.commits = realCommits;
          }
        }
      } catch {
        // keep search count
      }
    }

    // Re-sort after getting real counts
    topUsers.sort((a, b) => b.commits - a.commits);

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
