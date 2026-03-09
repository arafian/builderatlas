const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

  // Split by <article class="Box-row"> elements
  const articles = html.split(/<article\s+class="Box-row[^"]*">/i);

  for (const article of articles.slice(1)) {
    const chunk = article.split('</article>')[0];

    // Extract repo link: href="/owner/repo"
    // Pattern: <h2 ...><a href="/owner/repo" ...>
    const repoMatch = chunk.match(/href="\/([^\/\s"]+\/[^\/\s"]+?)"\s/);
    if (!repoMatch) continue;

    const fullName = repoMatch[1].trim();
    const url = `https://github.com/${fullName}`;

    // Extract description from <p> tag
    const descMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract language
    const langMatch = chunk.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    const language = langMatch ? langMatch[1].trim() : null;

    // Extract total stars - try multiple patterns
    const starsMatch = chunk.match(/\/stargazers"[^>]*>\s*(?:<[^>]*>)?\s*([\d,]+)\s*(?:<[^>]*>)?\s*<\/a>/s)
      || chunk.match(/href="[^"]*\/stargazers"[^>]*>([\s\S]*?)<\/a>/s);
    const starsText = starsMatch ? starsMatch[1].replace(/<[^>]+>/g, '').trim() : '0';
    const stars = parseInt(starsText.replace(/,/g, ''), 10) || 0;

    // Extract stars today/this week
    const todayMatch = chunk.match(/([\d,]+)\s*stars?\s*(today|this\s*week|this\s*month)/i);
    const starsToday = todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0;

    // Extract built-by contributor avatars
    const builtByMatch = chunk.match(/Built by([\s\S]*?)(?:\d[\d,]*\s*stars?\s|$)/i);
    const contributors: any[] = [];
    if (builtByMatch) {
      const avatarRe = /href="\/([^"\/]+)"[^>]*>[^<]*<img[^>]*src="(https:\/\/avatars\.githubusercontent\.com\/u\/\d+)/g;
      let m;
      while ((m = avatarRe.exec(builtByMatch[1])) !== null) {
        const login = m[1];
        if (login.includes('apps/') || login.endsWith('-bot') || login === 'dependabot') continue;
        contributors.push({ login, avatar_url: m[2] });
      }
    }

    repos.push({ fullName, url, description, language, stars, starsToday, contributors });
  }

  return repos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const trendingRes = await fetch('https://github.com/trending', {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; BuilderAtlas/1.0)',
      },
    });

    if (!trendingRes.ok) {
      console.error('Failed to fetch trending page:', trendingRes.status);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch trending: ${trendingRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await trendingRes.text();
    console.log(`Fetched HTML: ${html.length} chars`);

    // Debug: check if Box-row exists
    const boxRowCount = (html.match(/Box-row/g) || []).length;
    console.log(`Found ${boxRowCount} Box-row occurrences`);

    const repos = parseTrendingHtml(html).slice(0, 10);
    console.log('Parsed trending repos:', repos.map(r => `${r.fullName} (★${r.stars}, +${r.starsToday} today)`));

    if (repos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, repos: [], builders: [], message: 'No trending repos parsed', debug: { htmlLength: html.length, boxRowCount } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect unique builders
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

    // Clear and insert
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
