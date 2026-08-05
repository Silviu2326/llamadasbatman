import {
  RiCheckLine, RiCloseLine, RiFileTextLine, RiMapPin2Line, RiSearchEyeLine, RiToolsLine,
} from 'react-icons/ri'

// Vista de solo lectura de un informe SEO. La usan las páginas públicas
// (informe compartido e imán de leads); la página /seo interna mantiene su
// propia versión interactiva con botones de acción.

const INTENT_LABELS = {
  informacional: 'Informacional',
  comercial: 'Comercial',
  transaccional: 'Transaccional',
  local: 'Local',
}

const SEVERITY_COLORS = { alta: 'var(--danger)', media: 'var(--warn)', baja: 'var(--muted)' }

function scoreColor(score) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
}

function Card({ icon: Icon, title, children }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}><Icon style={{ width: 18, height: 18, color: 'var(--accent)' }} /> {title}</h2>
      {children}
    </section>
  )
}

export default function SeoReportView({ report }) {
  if (!report) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...styles.card, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ ...styles.scoreCircle, borderColor: scoreColor(report.score) }}>
          <strong style={{ fontSize: 28, color: scoreColor(report.score) }}>{report.score}</strong>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ 100</span>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ ...styles.cardTitle, marginBottom: 6 }}>Diagnóstico de {report.url}</h2>
          {!report.webAlive ? (
            <p style={styles.error}>No se pudo leer la web (caída o protegida contra bots).</p>
          ) : null}
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 14, lineHeight: 1.6 }}>{report.summary}</p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--dim)' }}>
            Generado el {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      </section>

      {report.checklist?.length ? (
        <Card icon={RiToolsLine} title="Auditoría técnica">
          <ul style={styles.list}>
            {report.checklist.map((item) => (
              <li key={item.id} style={styles.checkItem}>
                {item.ok
                  ? <RiCheckLine style={{ width: 18, height: 18, color: 'var(--success)', flexShrink: 0 }} />
                  : <RiCloseLine style={{ width: 18, height: 18, color: 'var(--danger)', flexShrink: 0 }} />}
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{item.label}</strong>
                  {!item.ok ? <p style={styles.hint}>{item.hint}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {report.keywords?.length ? (
        <Card icon={RiSearchEyeLine} title="Keywords recomendadas">
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Keyword</th>
                  <th style={styles.th}>Intención</th>
                  <th style={styles.th}>Dificultad</th>
                  <th style={styles.th}>Por qué</th>
                </tr>
              </thead>
              <tbody>
                {report.keywords.map((kw) => (
                  <tr key={kw.keyword}>
                    <td style={{ ...styles.td, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{kw.keyword}</td>
                    <td style={styles.td}>{INTENT_LABELS[kw.intent] || kw.intent}</td>
                    <td style={{ ...styles.td, textTransform: 'capitalize' }}>{kw.difficulty}</td>
                    <td style={styles.td}>{kw.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {report.technicalFixes?.length ? (
        <Card icon={RiToolsLine} title="Arreglos técnicos prioritarios">
          <ul style={styles.list}>
            {report.technicalFixes.map((fix) => (
              <li key={fix.title} style={styles.checkItem}>
                <span style={{ ...styles.severityDot, background: SEVERITY_COLORS[fix.severity] || 'var(--muted)' }} />
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{fix.title}</strong>
                  <p style={styles.hint}>{fix.howTo}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {report.contentPlan?.length ? (
        <Card icon={RiFileTextLine} title="Plan de contenidos">
          <ul style={styles.list}>
            {report.contentPlan.map((item) => (
              <li key={item.title} style={styles.checkItem}>
                <RiFileTextLine style={{ width: 16, height: 16, color: 'var(--violet)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{item.title}</strong>
                  <p style={styles.hint}>{item.format} · keyword: {item.keyword}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {report.localSeo?.length ? (
        <Card icon={RiMapPin2Line} title="SEO local">
          <ul style={styles.list}>
            {report.localSeo.map((action) => (
              <li key={action} style={styles.checkItem}>
                <RiMapPin2Line style={{ width: 16, height: 16, color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{action}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)',
  },
  scoreCircle: {
    width: 96, height: 96,
    borderRadius: '50%',
    border: '4px solid',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  checkItem: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  hint: { margin: '2px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 },
  severityDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 5 },
  error: { margin: '0 0 6px', fontSize: 13, color: 'var(--danger)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '8px 10px',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--dim)', borderBottom: '1px solid var(--line)',
  },
  td: { padding: '10px', color: 'var(--text)', borderBottom: '1px solid var(--line)', verticalAlign: 'top', lineHeight: 1.5 },
}
