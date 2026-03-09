const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function githubHeaders() {
  const token = Deno.env.get('BUILDER_ATLAS_PERSONAL_ACCESS_TOKEN');
  const h: Record<string, string> = {
    'Accept': 'text/html',
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

function parseTrendingHtml(html: string) {
  const repos: any[] = [];

  // Match repo articles - each trending repo is in an <article> or similar block
  // Pattern: owner/repo links like href="/owner/repo"
  const repoPattern = /class="Box-row"[^>]*>[\s\S]*?<\/article>/gi;
  // Simpler: split by repo entries
  const rows = html.split(/class="Box-row"/);

  for (const row of rows.slice(1)) { // skip first split part (before first repo)
    // Extract repo full name: href="/owner/repo"
    const nameMatch = row.match(/href="\/([^"]+?)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*\/\s*<span[^>]*>([^<]+)<\/span>/s);
    if (!nameMatch) continue;

    const fullName = `${nameMatch[2].trim()}/${nameMatch[3].trim()}`;
    const url = `https://github.com/${fullName}`;

    // Extract description
    const descMatch = row.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract language
    const langMatch = row.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    const language = langMatch ? langMatch[1].trim() : null;

    // Extract total stars - look for /stargazers link with number
    const starsMatch = row.match(/href="\/[^"]+\/stargazers"[^>]*>\s*([\d,]+)\s*<\/a>/s);
    const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0;

    // Extract stars today
    const todayMatch = row.match(/([\d,]+)\s*stars?\s*today/i);
    const starsToday = todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0;

    // Extract built-by contributors
    const builtBySection = row.match(/Built by([\s\S]*?)(?:\d+\s*stars?\s*today|$)/i);
    const contributors: any[] = [];
    if (builtBySection) {
      const avatarPattern = /href="\/([^"\/]+)"[^>]*>\s*<img[^>]*src="(https:\/\/avatars\.githubusercontent\.com\/[^"?]+)/g;
      let m;
      while ((m = avatarPattern.exec(builtBySection[1])) !== null) {
        const login = m[1];
        // Skip bots and app links
        if (login.includes('apps/') || login.includes('[bot]') || login.endsWith('-bot') || login === 'dependabot') continue;
        contributors.push({
          login,
          avatar_url: m[2],
        });
      }
    }

    repos.push({
      fullName,
      url,
      description,
      language,
      stars,
      starsToday,
      contributors,
    });
  }

  return repos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch GitHub's actual trending page
    const trendingRes = await fetch('https://github.com/trending', {
      headers: githubHeaders(),
    });

    if (!trendingRes.ok) {
      console.error('Failed to fetch trending page:', trendingRes.status);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch trending page: ${trendingRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await trendingRes.text();
    const repos = parseTrendingHtml(html).slice(0, 10); // top 10 trending
    console.log('Parsed trending repos:', repos.map(r => `${r.fullName} (★${r.stars}, +${r.starsToday} today)`));

    if (repos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, repos: [], builders: [], message: 'No trending repos found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect unique builders from contributors
    const allBuilders: any[] = [];
    const trendingRepos: any[] = [];
    const seen = new Set<string>();

    for (const repo of repos) {
      trendingRepos.push({
        name: repo.fullName,
        url: repo.url,
        description: repo.description,
        stars: repo.stars,
        language: repo.language,
        starsToday: repo.starsToday,
      });

      for (const c of repo.contributors) {
        if (seen.has(c.login)) continue;
        seen.add(c.login);

        allBuilders.push({
          username: c.login,
          github_url: `https://github.com/${c.login}`,
          avatar_url: c.avatar_url,
          source_repo: repo.fullName,
          source_repo_url: repo.url,
          description: `Top contributor to ${repo.fullName} (★${repo.stars.toLocaleString()}, +${repo.starsToday} today)`,
          tag: mapLanguageToTag(repo.language),
        });
      }
    }

    console.log(`Found ${allBuilders.length} builders from ${trendingRepos.length} trending repos`);

    // Clear existing builders and insert new ones
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dbHeaders = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    await fetch(`${supabaseUrl}/rest/v1/builders?id=not.is.null`, {
      method: 'DELETE',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
    });

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
          commits_per_week: 0,
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
