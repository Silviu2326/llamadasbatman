import React from 'react'
import { RiEditLine, RiCheckLine } from 'react-icons/ri'
import { useI18n } from '../../i18n'

export default function EditModeButton({ isEditMode, onClick }) {
  const { locale } = useI18n()
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: isEditMode
          ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
          : '#0d1117',
        border: '1px solid',
        borderColor: isEditMode ? 'transparent' : '#1e2433',
        borderRadius: 9,
        padding: '7px 13px',
        color: isEditMode ? '#ffffff' : '#94a3b8',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: isEditMode ? '0 0 20px rgba(79,70,229,0.35)' : 'none',
        transition: 'all .2s ease',
      }}
    >
      {isEditMode ? (
        <>
          <RiCheckLine style={{ width: 15, height: 15 }} />
          {locale === 'en' ? 'Done' : 'Listo'}
        </>
      ) : (
        <>
          <RiEditLine style={{ width: 15, height: 15 }} />
          {locale === 'en' ? 'Edit dashboard' : 'Editar dashboard'}
        </>
      )}
    </button>
  )
}
