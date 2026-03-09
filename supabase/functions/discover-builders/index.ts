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

function parseTrendingHtml(html: string) {
  const repos: any[] = [];
  const articles = html.split(/<article\s+class="Box-row[^"]*">/i);

  for (const article of articles.slice(1)) {
    const chunk = article.split('</article>')[0];

    const repoMatch = chunk.match(/href="\/([^\/\s"]+\/[^\/\s"]+?)"\s/);
    if (!repoMatch) continue;

    const fullName = repoMatch[1].trim();
    const url = `https://github.com/${fullName}`;

    const descMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const langMatch = chunk.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    const language = langMatch ? langMatch[1].trim() : null;

    const starsMatch = chunk.match(/\/stargazers"[^>]*>\s*(?:<[^>]*>)?\s*([\d,]+)\s*(?:<[^>]*>)?\s*<\/a>/s)
      || chunk.match(/href="[^"]*\/stargazers"[^>]*>([\s\S]*?)<\/a>/s);
    const starsText = starsMatch ? starsMatch[1].replace(/<[^>]+>/g, '').trim() : '0';
    const stars = parseInt(starsText.replace(/,/g, ''), 10) || 0;

    const todayMatch = chunk.match(/([\d,]+)\s*stars?\s*(today|this\s*week|this\s*month)/i);
    const starsToday = todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0;

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

// Fetch recent commit count for a user (last 7 days)
async function fetchRecentCommits(username: string, gh: Record<string, string>): Promise<number> {
  try {
    const res = await fetch(
      `https://api.github.com/users/${username}/events/public?per_page=100`,
      { headers: gh }
    );
    if (!res.ok) return 0;
    const events = await res.json();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let count = 0;
    for (const event of events) {
      if (event.type === 'PushEvent' && new Date(event.created_at) >= oneWeekAgo) {
        count += event.payload?.commits?.length || 0;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// Fetch user profile for human_score
async function fetchUserProfile(username: string, gh: Record<string, string>) {
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, { headers: gh });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function computeHumanScore(profile: any, username: string): number {
  if (!profile) return username.toLowerCase().includes('bot') ? 0 : 0.2;
  const hasBio = profile.bio ? 1 : 0;
  const hasFollowers = (profile.followers || 0) > 5 ? 1 : 0;
  const hasRepos = (profile.public_repos || 0) > 3 ? 1 : 0;
  const createdAt = new Date(profile.created_at || 0);
  const ageMs = Date.now() - createdAt.getTime();
  const isOldEnough = ageMs > 180 * 24 * 60 * 60 * 1000 ? 1 : 0;
  const notBot = username.toLowerCase().includes('bot') ? 0 : 1;
  return (hasBio + hasFollowers + hasRepos + isOldEnough + notBot) / 5;
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
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch trending: ${trendingRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await trendingRes.text();
    console.log(`Fetched HTML: ${html.length} chars`);

    // Limit to top 5 repos
    const repos = parseTrendingHtml(html).slice(0, 5);
    console.log('Parsed repos:', repos.map(r => r.fullName));

    if (repos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, repos: [], inserted_count: 0, message: 'No trending repos parsed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gh = githubHeaders();
    const maxStars = Math.max(...repos.map(r => r.stars), 1);

    // Track contributors across repos for breadth_score
    const contributorRepos = new Map<string, Set<string>>();
    const contributorData = new Map<string, {
      login: string; avatar_url: string; repoFullName: string; repoUrl: string;
      repoStars: number; repoStarsToday: number; language: string | null; description: string;
    }>();

    for (const repo of repos) {
      // Take up to 5 contributors per repo
      for (const c of repo.contributors.slice(0, 5)) {
        if (c.login.toLowerCase().includes('bot')) continue;

        if (!contributorRepos.has(c.login)) {
          contributorRepos.set(c.login, new Set());
        }
        contributorRepos.get(c.login)!.add(repo.fullName);

        // Store first seen repo data
        if (!contributorData.has(c.login)) {
          contributorData.set(c.login, {
            login: c.login,
            avatar_url: c.avatar_url,
            repoFullName: repo.fullName,
            repoUrl: repo.url,
            repoStars: repo.stars,
            repoStarsToday: repo.starsToday,
            language: repo.language,
            description: repo.description,
          });
        }
      }
    }

    // Limit to top 5 unique contributors overall
    const uniqueLogins = [...contributorData.keys()].slice(0, 5);
    console.log(`Scoring ${uniqueLogins.length} contributors`);

    // Fetch profiles and commits in parallel for each contributor
    const scoredBuilders: any[] = [];
    for (const login of uniqueLogins) {
      const data = contributorData.get(login)!;
      const [recentCommits, profile] = await Promise.all([
        fetchRecentCommits(login, gh),
        fetchUserProfile(login, gh),
      ]);

      const commitScore = Math.min(recentCommits, 20) / 20;
      const repoScore = data.repoStars / maxStars;
      const humanScore = computeHumanScore(profile, login);
      const breadthScore = Math.min(contributorRepos.get(login)!.size, 3) / 3;

      const totalScore = 0.45 * commitScore + 0.25 * repoScore + 0.20 * humanScore + 0.10 * breadthScore;

      // Skip very bot-like accounts
      if (humanScore < 0.2) {
        console.log(`Skipping ${login} (humanScore=${humanScore.toFixed(2)})`);
        continue;
      }

      scoredBuilders.push({
        name: login,
        github_url: `https://github.com/${login}`,
        project_url: data.repoUrl,
        description: `Top contributor to ${data.repoFullName} (★${data.repoStars.toLocaleString()}, +${data.repoStarsToday} today)`,
        tags: [mapLanguageToTag(data.language)],
        commits_per_week: recentCommits,
        score: Math.round(totalScore * 100) / 100,
      });

      console.log(`${login}: score=${totalScore.toFixed(3)} (commit=${commitScore.toFixed(2)} repo=${repoScore.toFixed(2)} human=${humanScore.toFixed(2)} breadth=${breadthScore.toFixed(2)})`);
    }

    // Sort by score descending
    scoredBuilders.sort((a, b) => b.score - a.score);

    // Database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dbHeaders = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    // Only delete auto-imported builders (those with github.com project URLs), preserve manual ones
    await fetch(`${supabaseUrl}/rest/v1/builders?project_url=like.*github.com*`, {
      method: 'DELETE',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
    });

    let insertedCount = 0;
    for (const b of scoredBuilders) {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/builders`, {
        method: 'POST',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(b),
      });

      if (insertRes.ok) {
        insertedCount++;
      } else {
        console.error(`Insert failed for ${b.name}:`, await insertRes.text());
      }
    }

    const trendingRepos = repos.map(r => ({
      name: r.fullName, url: r.url, description: r.description,
      stars: r.stars, language: r.language, starsToday: r.starsToday,
    }));

    return new Response(
      JSON.stringify({ success: true, repos: trendingRepos, inserted_count: insertedCount }),
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
