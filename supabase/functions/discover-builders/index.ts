const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function githubHeaders() {
  const token = Deno.env.get('BUILDER_ATLAS_PERSONAL_ACCESS_TOKEN');
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BuilderAtlas',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = oneWeekAgo.toISOString().split('T')[0];
    const gh = githubHeaders();

    // Use GitHub Search Commits API with auth token
    const commitCounts: Record<string, { username: string; commits: number }> = {};

    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/search/commits?q=committer-date:>${dateStr}&sort=committer-date&order=desc&per_page=100&page=${page}`,
        { headers: { ...gh, 'Accept': 'application/vnd.github.cloak-preview+json' } }
      );

      if (!res.ok) {
        console.error(`GitHub search API page ${page}: ${res.status} ${await res.text()}`);
        break;
      }

      const data = await res.json();
      if (!data.items?.length) break;

      for (const item of data.items) {
        const username = item.author?.login;
        if (!username) continue;
        if (username.includes('[bot]') || username.endsWith('-bot') || username === 'dependabot' || username === 'renovate') continue;

        if (!commitCounts[username]) {
          commitCounts[username] = { username, commits: 0 };
        }
        commitCounts[username].commits += 1;
      }
    }

    console.log(`Found ${Object.keys(commitCounts).length} unique committers from search`);

    // Sort and take top 5
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

    // Get real weekly commit count from each user's events
    for (const user of topUsers) {
      try {
        const eventsRes = await fetch(
          `https://api.github.com/users/${user.username}/events/public?per_page=100`,
          { headers: gh }
        );
        if (eventsRes.ok) {
          const events = await eventsRes.json();
          let realCommits = 0;
          for (const event of events) {
            if (event.type === 'PushEvent' && new Date(event.created_at) >= oneWeekAgo) {
              realCommits += event.payload?.size || event.payload?.commits?.length || 0;
            }
          }
          user.commits = Math.max(user.commits, realCommits);
        }
      } catch { /* keep search count */ }
    }

    topUsers.sort((a, b) => b.commits - a.commits);

    // Insert into database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dbHeaders = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    const inserted = [];
    for (const user of topUsers) {
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/builders?github_url=eq.https://github.com/${user.username}&select=id`,
        { headers: dbHeaders }
      );
      const existing = await checkRes.json();

      if (existing.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/builders?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            commits_per_week: user.commits,
            commits_updated_at: new Date().toISOString(),
          }),
        });
        continue;
      }

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/builders`, {
        method: 'POST',
        headers: { ...dbHeaders, 'Prefer': 'return=representation' },
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
