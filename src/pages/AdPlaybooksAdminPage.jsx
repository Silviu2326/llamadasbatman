import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import {
  RiBook2Line, RiAddLine, RiEditLine, RiSaveLine, RiCloseLine,
  RiDeleteBinLine, RiCheckLine, RiSearchLine, RiBarChartLine,
} from 'react-icons/ri'
import '../dashboard.css'
import { useI18n } from '../i18n'

const EMPTY = {
  vertical: '',
  offer: '',
  leadMagnet: '',
  adCopy: '',
  landingTemplateId: 'generic-v1',
  imagePrompt: '',
}

export default function AdPlaybooksAdminPage() {
  const { t } = useI18n()
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const kpis = useMemo(() => ({
    total: playbooks.length,
    active: playbooks.filter(p => p.isActive).length,
    inactive: playbooks.filter(p => !p.isActive).length,
  }), [playbooks])

  const filteredPlaybooks = useMemo(
    () => playbooks.filter(p => p.vertical.toLowerCase().includes(search.trim().toLowerCase())),
    [playbooks, search]
  )

  useEffect(() => {
    loadPlaybooks()
  }, [])

  async function loadPlaybooks() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/ad-playbooks')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPlaybooks(Array.isArray(data) ? data : [])
    } catch {
      setMessage(t('adPlaybooks.loadError'))
    } finally {
      setLoading(false)
    }
  }

  function startNew() {
    setEditing('new')
    setForm(EMPTY)
  }

  function startEdit(pb) {
    setEditing(pb.id)
    setForm({
      vertical: pb.vertical,
      offer: pb.offer,
      leadMagnet: pb.leadMagnet || '',
      adCopy: pb.adCopy,
      landingTemplateId: pb.landingTemplateId,
      imagePrompt: pb.imagePrompt,
    })
  }

  async function save() {
    if (!form.vertical.trim() || !form.offer.trim() || !form.adCopy.trim() || !form.imagePrompt.trim()) {
      setMessage('Completá los campos obligatorios.')
      return
    }
    setSaving(true)
    try {
      const url = editing === 'new' ? '/api/ad-playbooks' : `/api/ad-playbooks/${editing}`
      const method = editing === 'new' ? 'POST' : 'PUT'
      const res = await apiFetch(url, { method, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      setEditing(null)
      setForm(EMPTY)
      setMessage(t('adPlaybooks.saved'))
      await loadPlaybooks()
    } catch {
      setMessage(t('adPlaybooks.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(pb) {
    try {
      const res = await apiFetch(`/api/ad-playbooks/${pb.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !pb.isActive }),
      })
      if (!res.ok) throw new Error()
      await loadPlaybooks()
    } catch {
      setMessage(t('adPlaybooks.statusError'))
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RiBook2Line style={{ width: 22, height: 22, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{t('adPlaybooks.title')}</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>{t('adPlaybooks.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={startNew}
          disabled={editing === 'new'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 9, border: 'none',
            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <RiAddLine style={{ width: 15, height: 15 }} /> {t('adPlaybooks.new')}
        </button>
      </div>

      {message && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          padding: '10px 14px', borderRadius: 10, background: message.includes('No') ? '#ef444415' : '#10b98115',
          border: message.includes('No') ? '1px solid #ef444440' : '1px solid #10b98140',
          color: message.includes('No') ? '#ef4444' : '#10b981', fontSize: 13,
        }}>
          {message.includes('No') ? <RiCloseLine style={{ width: 16, height: 16 }} /> : <RiCheckLine style={{ width: 16, height: 16 }} />}
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: t('adPlaybooks.total'), value: kpis.total, color: '#818cf8' },
          { label: t('adPlaybooks.active'), value: kpis.active, color: '#10b981' },
          { label: t('adPlaybooks.inactive'), value: kpis.inactive, color: '#ef4444' },
        ].map(k => (
          <div key={k.label} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>{k.label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 320 }}>
        <RiSearchLine style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4b5563', width: 14, height: 14 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('adPlaybooks.search')}
          style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '9px 12px 9px 32px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {editing === 'new' && (
        <FormCard form={form} setForm={setForm} onSave={save} onCancel={() => { setEditing(null); setForm(EMPTY) }} saving={saving} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {playbooks.length === 0 && !editing ? (
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '40px 0' }}>{t('adPlaybooks.noItems')}</p>
        ) : filteredPlaybooks.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '40px 0' }}>{t('adPlaybooks.noMatches', { query: search })}</p>
        ) : (
          filteredPlaybooks.map(pb => (
            <div key={pb.id} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}
                onClick={() => editing !== pb.id && startEdit(pb)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', textTransform: 'capitalize' }}>{pb.vertical}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: pb.isActive ? '#10b98115' : '#ef444415',
                    color: pb.isActive ? '#10b981' : '#ef4444',
                    border: `1px solid ${pb.isActive ? '#10b98140' : '#ef444440'}`,
                  }}>
                    {pb.isActive ? t('adPlaybooks.active') : t('adPlaybooks.inactive')}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#6b7280' }}>
                    <RiBarChartLine style={{ width: 12, height: 12 }} /> {t('adPlaybooks.usedIn', { count: pb._count?.campaigns ?? 0 })}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={e => { e.stopPropagation(); startEdit(pb) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid #1e2433', background: '#111827', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
                  >
                    <RiEditLine style={{ width: 13, height: 13 }} /> {t('adPlaybooks.edit')}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); toggleActive(pb) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid #1e2433', background: '#111827', color: pb.isActive ? '#ef4444' : '#10b981', fontSize: 12, cursor: 'pointer' }}
                  >
                    {pb.isActive ? (<><RiCloseLine style={{ width: 13, height: 13 }} /> {t('adPlaybooks.disable')}</>) : (<><RiCheckLine style={{ width: 13, height: 13 }} /> {t('adPlaybooks.enable')}</>)}
                  </button>
                </div>
              </div>

              {editing === pb.id && (
                <div style={{ borderTop: '1px solid #1e2433', padding: '16px', background: '#111827' }}>
                  <FormCard form={form} setForm={setForm} onSave={save} onCancel={() => { setEditing(null); setForm(EMPTY) }} saving={saving} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function FormCard({ form, setForm, onSave, onCancel, saving }) {
  const { t } = useI18n()
  return (
    <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <Field label={t('adPlaybooks.vertical')} value={form.vertical} onChange={v => setForm(f => ({ ...f, vertical: v }))} placeholder="e.g. dentists" />
        <Field label={t('adPlaybooks.landingTemplate')} value={form.landingTemplateId} onChange={v => setForm(f => ({ ...f, landingTemplateId: v }))} placeholder="generic-v1" />
      </div>
      <Field label="Oferta" value={form.offer} onChange={v => setForm(f => ({ ...f, offer: v }))} placeholder="Consulta inicial gratuita" />
      <Field label="Lead magnet" value={form.leadMagnet} onChange={v => setForm(f => ({ ...f, leadMagnet: v }))} placeholder="Guía gratis..." />
      <Field label="Copy del anuncio" value={form.adCopy} onChange={v => setForm(f => ({ ...f, adCopy: v }))} placeholder="Texto del anuncio" textarea />
      <Field label="Prompt de imagen" value={form.imagePrompt} onChange={v => setForm(f => ({ ...f, imagePrompt: v }))} placeholder="Prompt en inglés para generar la imagen" textarea />
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: saving ? '#374151' : '#10b981', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
          }}
        >
          <RiSaveLine style={{ width: 14, height: 14 }} /> {saving ? t('adPlaybooks.saving') : t('adPlaybooks.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8, border: '1px solid #1e2433',
            background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer',
          }}
        >
          <RiCloseLine style={{ width: 14, height: 14 }} /> {t('adPlaybooks.cancel')}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea }) {
  const { locale } = useI18n()
  const labels = locale === 'en' ? { Vertical: 'Vertical', Oferta: 'Offer', 'Lead magnet': 'Lead magnet', 'Copy del anuncio': 'Ad copy', 'Prompt de imagen': 'Image prompt' } : {}
  const placeholders = locale === 'en' ? { 'Consulta inicial gratuita': 'Free initial consultation', 'Texto del anuncio': 'Ad text' } : {}
  const displayLabel = labels[label] || label
  const displayPlaceholder = placeholders[placeholder] || placeholder
  const style = {
    background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8,
    padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit',
    width: '100%', resize: 'vertical',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{displayLabel}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={displayPlaceholder} rows={3} style={style} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={displayPlaceholder} style={style} />
      )}
    </div>
  )
}
