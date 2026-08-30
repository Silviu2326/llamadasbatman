import './product-page-header.css'

export function ProductSectionTabs({ items, activeId, onChange, ariaLabel }) {
  return <nav className="product-section-tabs" aria-label={ariaLabel} style={{ '--product-tab-count': items.length }}>
    {items.map(item => {
      const active = item.id === activeId
      return <button
        type="button"
        key={item.id}
        className={active ? 'is-active' : ''}
        aria-current={active ? 'page' : undefined}
        onClick={() => onChange(item.id)}
      >
        {item.Icon ? <item.Icon aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </button>
    })}
  </nav>
}

export default function ProductPageHeader({ Icon, title, description, actions, navigation, className = '' }) {
  return <header className={`product-page-header ${className}`.trim()}>
    <div className="product-page-header__content">
      <div className="product-page-header__title-row">
        {Icon ? <span className="product-page-header__icon" aria-hidden="true"><Icon /></span> : null}
        <h1>{title}</h1>
      </div>
      {description ? <p>{description}</p> : null}
      {navigation ? <div className="product-page-header__navigation">{navigation}</div> : null}
    </div>
    {actions ? <div className="product-page-header__actions">{actions}</div> : null}
  </header>
}
