import { useEffect, useRef, useState } from 'react'
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiMore2Line,
} from 'react-icons/ri'
import './agent-detail-nav.css'

export const DEFAULT_AGENT_DETAIL_SECTIONS = [
  { id: 'agent-summary', label: 'Resumen' },
  { id: 'agent-behavior', label: 'Comportamiento' },
  { id: 'agent-stack', label: 'Stack' },
  { id: 'agent-playbook', label: 'Playbook' },
  { id: 'agent-performance', label: 'Rendimiento' },
]

function toCssOffset(offset) {
  if (typeof offset === 'number') return `${offset}px`
  return offset || '0px'
}

function getNumericOffset(offset) {
  const value = Number.parseFloat(String(offset || '0'))
  return Number.isFinite(value) ? value : 0
}

export default function AgentDetailNav({
  sections = DEFAULT_AGENT_DETAIL_SECTIONS,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  unsavedLabel = 'Cambios sin guardar',
  actions = [],
  onAction,
  stickyOffset = 0,
  className = '',
}) {
  const [detectedSection, setDetectedSection] = useState(sections[0]?.id || '')
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const actionsRef = useRef(null)
  const actionTriggerRef = useRef(null)
  const actionMenuRef = useRef(null)
  const selectedSection = activeSection ?? detectedSection
  const rootClassName = ['agent-detail-nav', className].filter(Boolean).join(' ')

  useEffect(() => {
    if (activeSection || typeof IntersectionObserver === 'undefined') return undefined

    const targets = sections
      .map(section => document.getElementById(section.id))
      .filter(Boolean)

    if (!targets.length) return undefined

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0]

        if (!visible?.target?.id) return
        setDetectedSection(current => current === visible.target.id ? current : visible.target.id)
        onSectionChange?.(visible.target.id)
      },
      {
        rootMargin: `-${getNumericOffset(stickyOffset) + 56}px 0px -55% 0px`,
        threshold: [0, 0.2, 0.6, 1],
      },
    )

    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [activeSection, onSectionChange, sections, stickyOffset])

  useEffect(() => {
    if (!isActionsOpen) return undefined

    const closeOnOutsidePointer = event => {
      if (!actionsRef.current?.contains(event.target)) setIsActionsOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      setIsActionsOpen(false)
      actionTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isActionsOpen])

  useEffect(() => {
    if (!isActionsOpen) return
    actionMenuRef.current?.querySelector('button:not(:disabled)')?.focus()
  }, [isActionsOpen])

  const selectSection = sectionId => {
    setDetectedSection(sectionId)
    onSectionChange?.(sectionId)
  }

  const handleAction = (action, event) => {
    setIsActionsOpen(false)
    action.onSelect?.(action, event)
    onAction?.(action, event)
  }

  const handleMenuKeyDown = event => {
    const menuItems = [...(actionMenuRef.current?.querySelectorAll('button:not(:disabled)') || [])]
    const currentIndex = menuItems.indexOf(document.activeElement)

    if (event.key === 'Home' || (event.key === 'ArrowUp' && currentIndex === 0)) {
      event.preventDefault()
      menuItems.at(0)?.focus()
    } else if (event.key === 'End' || (event.key === 'ArrowDown' && currentIndex === menuItems.length - 1)) {
      event.preventDefault()
      menuItems.at(-1)?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      menuItems[(currentIndex + 1) % menuItems.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      menuItems[(currentIndex - 1 + menuItems.length) % menuItems.length]?.focus()
    }
  }

  return (
    <nav
      className={rootClassName}
      aria-label="Navegación del detalle del agente"
      style={{ '--agent-detail-nav-offset': toCssOffset(stickyOffset) }}
    >
      <div className="agent-detail-nav__scroll-area">
        <div className="agent-detail-nav__links" role="list">
          {sections.map(section => {
            const isActive = selectedSection === section.id
            return (
              <a
                className={`agent-detail-nav__link${isActive ? ' is-active' : ''}`}
                href={`#${section.id}`}
                key={section.id}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => selectSection(section.id)}
              >
                {section.label}
              </a>
            )
          })}
        </div>
      </div>

      <div className="agent-detail-nav__tools">
        {hasUnsavedChanges ? (
          <span className="agent-detail-nav__unsaved" role="status" aria-live="polite">
            <i aria-hidden="true" />
            <span>{unsavedLabel}</span>
          </span>
        ) : null}

        {actions.length ? (
          <div className="agent-detail-nav__actions" ref={actionsRef}>
            <button
              ref={actionTriggerRef}
              className="agent-detail-nav__action-trigger"
              type="button"
              aria-label="Abrir acciones del agente"
              aria-haspopup="menu"
              aria-expanded={isActionsOpen}
              onClick={() => setIsActionsOpen(open => !open)}
              onKeyDown={event => {
                if (event.key === 'ArrowDown' && !isActionsOpen) {
                  event.preventDefault()
                  setIsActionsOpen(true)
                }
              }}
            >
              <RiMore2Line aria-hidden="true" />
              <span>Acciones</span>
              <RiArrowDownSLine aria-hidden="true" />
            </button>

            {isActionsOpen ? (
              <div
                ref={actionMenuRef}
                className="agent-detail-nav__menu"
                role="menu"
                aria-label="Acciones del agente"
                onKeyDown={handleMenuKeyDown}
              >
                {actions.map(action => {
                  const ActionIcon = action.icon
                  return (
                    <button
                      className={`agent-detail-nav__menu-item${action.tone === 'danger' ? ' is-danger' : ''}`}
                      disabled={action.disabled}
                      key={action.id || action.label}
                      role="menuitem"
                      type="button"
                      onClick={event => handleAction(action, event)}
                    >
                      {ActionIcon ? <ActionIcon aria-hidden="true" /> : <RiCheckLine aria-hidden="true" />}
                      <span>
                        <strong>{action.label}</strong>
                        {action.hint ? <small>{action.hint}</small> : null}
                      </span>
                      <RiArrowRightSLine aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  )
}
