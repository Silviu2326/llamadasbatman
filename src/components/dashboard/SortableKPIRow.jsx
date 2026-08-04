import React from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RiCloseLine } from 'react-icons/ri'
import KPICard from '../KPICard'
import { KPI_WIDGET_IDS, KPI_INDEX_MAP } from '../../dashboardConfig'
import { useI18n } from '../../i18n'

function SortableKpiItem({ id, kpi, isEditMode, onRemove }) {
  const { locale } = useI18n()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    flex: '1 1 160px',
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.9 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isEditMode ? 'kpi-edit-mode' : 'kpi-normal'}
      {...attributes}
      {...listeners}
    >
      {isEditMode && (
        <button
          className="widget-remove-btn"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(id)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          title={locale === 'en' ? 'Remove KPI' : 'Quitar KPI'}
        >
          <RiCloseLine style={{ width:12, height:12 }} />
        </button>
      )}
      <KPICard {...kpi} delay="0ms" large />
    </div>
  )
}

export default function SortableKPIRow({ kpiData, kpiOrder, activeWidgets, isEditMode, onRemove, onReorder }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeKpiIds = kpiOrder.filter(id => activeWidgets.has(id) && KPI_WIDGET_IDS.includes(id))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = activeKpiIds.indexOf(active.id)
      const newIndex = activeKpiIds.indexOf(over.id)
      onReorder(arrayMove(activeKpiIds, oldIndex, newIndex))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={activeKpiIds}
        strategy={horizontalListSortingStrategy}
      >
        <div className="db-kpi-row" style={{ position:'relative', zIndex: isEditMode ? 20 : 'auto' }}>
          {activeKpiIds.map((id) => {
            const index = KPI_INDEX_MAP[id]
            const kpi = kpiData[index]
            if (!kpi) return null
            return (
              <SortableKpiItem
                key={id}
                id={id}
                kpi={kpi}
                isEditMode={isEditMode}
                onRemove={onRemove}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
