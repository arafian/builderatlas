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

function mapLanguageToTag(lang: string | null): string {
  if (!lang) return 'Open Source';
  const map: Record<string, string> = {
    Python: 'AI', TypeScript: 'Web', JavaScript: 'Web', Rust: 'Infra',
    Go: 'Infra', C: 'Infra', 'C++': 'Infra', Java: 'Mobile',
    Kotlin: 'Mobile', Swift: 'Mobile', Dart: 'Mobile', Ruby: 'Web',
  };
  return map[lang] || 'Open Source';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gh = githubHeaders();

    // Step 1: Fetch top 3 trending repos (most starred, created in last 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const searchRes = await fetch(
      `https://api.github.com/search/repositories?q=created:>${oneWeekAgo}&sort=stars&order=desc&per_page=3`,
      { headers: gh }
    );

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error('Search API error:', searchRes.status, text);
      return new Response(
        JSON.stringify({ success: false, error: `GitHub search failed: ${searchRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json();
    const repos = (searchData.items || []).slice(0, 3);
    console.log('Trending repos:', repos.map((r: any) => `${r.full_name} (★${r.stargazers_count})`));

    if (repos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, repos: [], builders: [], message: 'No trending repos found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: For each repo, fetch top 5 contributors
    const allBuilders: any[] = [];
    const trendingRepos: any[] = [];

    for (const repo of repos) {
      const repoInfo = {
        name: repo.full_name,
        url: repo.html_url,
        description: repo.description || '',
        stars: repo.stargazers_count,
        language: repo.language,
      };
      trendingRepos.push(repoInfo);

      const contribRes = await fetch(
        `https://api.github.com/repos/${repo.full_name}/contributors?per_page=10`,
        { headers: gh }
      );

      if (!contribRes.ok) {
        console.error(`Contributors for ${repo.full_name}: ${contribRes.status}`);
        continue;
      }

      const contributors = await contribRes.json();
      // Filter bots, take top 5
      const humans = contributors
        .filter((c: any) => c.type === 'User' && !c.login.includes('[bot]') && !c.login.endsWith('-bot') && !c.login.endsWith('bot'))
        .slice(0, 5);

      for (const c of humans) {
        // Avoid duplicates across repos
        if (allBuilders.some(b => b.username === c.login)) continue;

        allBuilders.push({
          username: c.login,
          github_url: c.html_url,
          avatar_url: c.avatar_url,
          contributions: c.contributions,
          source_repo: repo.full_name,
          source_repo_url: repo.html_url,
          description: `Top contributor to ${repo.full_name} (★${repo.stargazers_count})`,
          tag: mapLanguageToTag(repo.language),
        });
      }
    }

    console.log(`Found ${allBuilders.length} builders from ${trendingRepos.length} repos`);

    // Step 3: Clear existing builders and insert new ones
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dbHeaders = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    // Delete all existing
    await fetch(`${supabaseUrl}/rest/v1/builders?id=not.is.null`, {
      method: 'DELETE',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
    });

    // Insert new builders
    let insertedCount = 0;
    for (const b of allBuilders) {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/builders`, {
        method: 'POST',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          name: b.username,
          github_url: b.github_url,
          project_url: b.source_repo_url,
          description: b.description,
          tags: [b.tag],
          commits_per_week: b.contributions,
        }),
      });

      if (insertRes.ok) {
        insertedCount++;
      } else {
        console.error(`Insert failed for ${b.username}:`, await insertRes.text());
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        repos: trendingRepos,
        builders: allBuilders,
        inserted_count: insertedCount,
      }),
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
