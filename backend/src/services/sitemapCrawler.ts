export function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc\b[^>]*>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/loc>/gis)]
    .map(m => m[1].trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
    .filter(url => /^https?:\/\//i.test(url))
}
export async function crawlSitemaps(origin: string, robots: string | null, read: (url: string) => Promise<string | null>, maxMaps = 20, maxUrls = 2000) {
  const host = new URL(origin).hostname.replace(/^www\./, '')
  const sameSite = (value: string) => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password && u.hostname.replace(/^www\./, '') === host } catch { return false } }
  const declared = [...(robots ?? '').matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map(m => m[1]).filter(sameSite)
  const pending = [...new Set([...declared, origin + '/sitemap.xml'])]
  const visited = new Set<string>(), urls = new Set<string>(), failed: string[] = []
  let sitemapCount = 0, truncated = false
  while (pending.length && visited.size < maxMaps && urls.size < maxUrls) {
    const url = pending.shift()!
    if (visited.has(url) || !sameSite(url)) continue
    visited.add(url)
    const xml = await read(url)
    if (!xml || !/<(?:sitemapindex|urlset)\b/i.test(xml)) { failed.push(url); continue }
    sitemapCount++
    const locs = sitemapLocations(xml).filter(sameSite)
    if (/<sitemapindex\b/i.test(xml)) {
      for (const loc of locs) {
        if (visited.has(loc) || pending.includes(loc)) continue
        if (visited.size + pending.length >= maxMaps) { truncated = true; break }
        pending.push(loc)
      }
    } else {
      for (const loc of locs) {
        if (urls.size >= maxUrls) { truncated = true; break }
        const normalized = new URL(loc); normalized.hash = ''
        urls.add(normalized.href)
      }
    }
  }
  return { urls: [...urls], sitemapCount, truncated: truncated || pending.length > 0, failed }
}

/** Respect rules for generic crawlers, including Allow exceptions. */
export function robotsAllows(robots: string | null, url: string): boolean {
  if (!robots) return true
  let agents: string[] = [], rulesStarted = false
  const rules: { allow: boolean; path: string }[] = []
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase(), value = match[2].trim()
    if (key === 'user-agent') { if (rulesStarted) { agents = []; rulesStarted = false }; agents.push(value.toLowerCase()); continue }
    if (key === 'allow' || key === 'disallow') {
      rulesStarted = true
      if (agents.includes('*') && value) rules.push({ allow: key === 'allow', path: value })
    }
  }
  const target = new URL(url).pathname + new URL(url).search
  const matches = rules.filter(rule => {
    const end = rule.path.endsWith('$')
    const raw = end ? rule.path.slice(0, -1) : rule.path
    const pattern = raw.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    return new RegExp('^' + pattern + (end ? '$' : '')).test(target)
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))
  return matches[0]?.allow ?? true
}
