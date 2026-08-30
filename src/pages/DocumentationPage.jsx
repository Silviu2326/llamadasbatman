import { useDeferredValue, useMemo, useState } from 'react'
import { RiArrowRightSLine, RiBook2Line, RiCloseLine, RiSearchLine } from 'react-icons/ri'
import { DOC_CATEGORIES, DOCUMENTS } from './learningData'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './learning.css'

export default function DocumentationPage({ sectionNavigation = null }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todo')
  const [selectedId, setSelectedId] = useState(DOCUMENTS[0].id)
  const deferredSearch = useDeferredValue(search)
  const visible = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase()
    return DOCUMENTS.filter(document => {
      const matchesCategory = category === 'Todo' || document.category === category
      const matchesSearch = !term || `${document.title} ${document.description} ${document.category}`.toLocaleLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [category, deferredSearch])
  const selected = visible.find(document => document.id === selectedId) || visible[0] || null

  return (
    <main className="learn-page docs-page dark-scroll">
      <ProductPageHeader
        Icon={RiBook2Line}
        title="Documentación"
        description="Guías, referencias y respuestas prácticas para configurar, operar e integrar Vendrava."
        navigation={sectionNavigation}
        actions={<label className="docs-header-search"><RiSearchLine /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar documentación…" aria-label="Buscar en la documentación" />{search ? <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><RiCloseLine /></button> : null}</label>}
      />

      <section className="docs-toolbar" aria-label="Filtrar documentación"><div className="docs-category-list" role="tablist" aria-label="Categorías">{DOC_CATEGORIES.map(item => <button type="button" role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><span className="learn-count">{visible.length} artículos</span></section>

      <section className="docs-layout" aria-label="Artículos de documentación">
        <div className="docs-list">{visible.length ? visible.map(document => { const Icon = document.Icon; return <button type="button" className={`docs-card ${selected.id === document.id ? 'active' : ''}`} key={document.id} onClick={() => setSelectedId(document.id)} style={{ '--doc-accent': document.accent }}><span className="docs-card-icon"><Icon /></span><span><small>{document.category}</small><strong>{document.title}</strong><span>{document.description}</span><em>{document.readTime} de lectura</em></span><RiArrowRightSLine /></button> }) : <div className="docs-empty"><RiSearchLine /><strong>No encontramos esa guía</strong><span>Prueba con otra búsqueda o vuelve a mostrar todas las categorías.</span><button type="button" onClick={() => { setSearch(''); setCategory('Todo') }}>Limpiar filtros</button></div>}</div>
        {selected ? <article className="docs-detail" style={{ '--doc-accent': selected.accent }}><span className="learn-overline">{selected.category}</span><h2>{selected.title}</h2><p>{selected.body}</p><div className="docs-detail-meta"><span>{selected.readTime} de lectura</span><span>Actualizado para la plataforma actual</span></div></article> : null}
      </section>
    </main>
  )
}
