import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { renderMarkdown } from '../lib/simpleMarkdown'
import PageLoadingState from '../components/ui/PageLoadingState'

// Blog público de una landing: lista de artículos y detalle. El detalle fija
// title y meta description para que Google indexe cada artículo.
// ponytail: renderizado en cliente — si el SEO del blog se vuelve crítico,
// el siguiente paso es prerender/SSR de estas rutas.

function useBlogFetch(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(path, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || 'Contenido no disponible')
        setData(body.data)
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [path])
  return { data, error, loading }
}

export function PublicBlogIndexPage() {
  const { slug } = useParams()
  const { data: articles, error, loading } = useBlogFetch(`/api/public/seo/blog/${encodeURIComponent(slug ?? '')}`)

  if (loading) return <PageLoadingState label="Cargando blog" />

  return (
    <div style={styles.page}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={styles.title}>Blog</h1>
      </header>
      {loading ? <p style={styles.muted}>Cargando…</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}
      {articles?.length === 0 ? <p style={styles.muted}>Todavía no hay artículos publicados.</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(articles ?? []).map((article) => (
          <Link key={article.slug} to={`/l/${slug}/blog/${article.slug}`} style={styles.card}>
            <strong style={{ fontSize: 16, color: 'var(--text-strong)' }}>{article.name}</strong>
            <span style={styles.muted}>{new Date(article.publishedAt).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function PublicBlogPostPage() {
  const { slug, articleSlug } = useParams()
  const { data: article, error, loading } = useBlogFetch(
    `/api/public/seo/blog/${encodeURIComponent(slug ?? '')}/${encodeURIComponent(articleSlug ?? '')}`
  )

  if (loading) return <PageLoadingState label="Cargando artículo" />

  useEffect(() => {
    if (!article?.name) return undefined
    const previousTitle = document.title
    document.title = article.name
    return () => { document.title = previousTitle }
  }, [article])

  return (
    <div style={styles.page}>
      {loading ? <p style={styles.muted}>Cargando artículo…</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}
      {article ? (
        <article className="seo-blog-article" style={styles.article}>
          <h1 style={styles.title}>{article.name}</h1>
          <p style={styles.muted}>
            Publicado el {new Date(article.publishedAt).toLocaleDateString()}
            {article.updatedAt && article.updatedAt !== article.publishedAt
              ? ` · actualizado el ${new Date(article.updatedAt).toLocaleDateString()}`
              : ''}
          </p>
          <div style={{ marginTop: 16, fontSize: 15, lineHeight: 1.75, color: 'var(--text)' }}>
            {renderMarkdown(article.content)}
          </div>
          <p style={{ marginTop: 32 }}>
            <Link to={`/l/${slug}/blog`} style={{ color: 'var(--accent)' }}>← Ver todos los artículos</Link>
          </p>
        </article>
      ) : null}
    </div>
  )
}

const styles = {
  page: { padding: '32px 24px', maxWidth: 760, margin: '0 auto', minHeight: '100dvh' },
  title: { margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5, lineHeight: 1.25 },
  muted: { fontSize: 13, color: 'var(--muted)' },
  error: { fontSize: 14, color: 'var(--danger)' },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '16px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    textDecoration: 'none',
  },
  article: { paddingBottom: 40 },
}
