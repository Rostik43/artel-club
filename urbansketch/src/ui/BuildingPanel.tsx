import { makeBuilding, useStore } from '../app/store'
import { TYPOLOGIES, typologyById } from '../domain/typologies'
import { NumberField, Section, fmt } from './primitives'

export function BuildingPanel() {
  const { state, dispatch } = useStore()
  const { project, selectedIds, placingTypologyId } = state
  const selected = project.buildings.filter((b) => selectedIds.includes(b.id))
  const single = selected.length === 1 ? selected[0] : null

  return (
    <>
      <Section title="Типологии">
        <div style={{ display: 'grid', gap: 6 }}>
          {TYPOLOGIES.map((t) => (
            <button
              key={t.id}
              className={`typology${placingTypologyId === t.id ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'setPlacingTypology', id: t.id })}
              title="Выбрать и перейти в режим посадки"
            >
              <span className="swatch" style={{ background: t.color }} />
              <span>{t.name}</span>
              <span className="meta">
                {t.width}×{t.depth}
              </span>
            </button>
          ))}
        </div>
        <button
          className="btn block"
          onClick={() => {
            const t = typologyById(placingTypologyId)
            dispatch({ type: 'addBuilding', building: makeBuilding(t.id, 0, 0, 0) })
          }}
        >
          Поставить в центр участка
        </button>
        <p className="hint">
          В режиме «Посадка» корпус ставится по клику. В режиме «Выбор»: перетаскивание мышью, R — поворот на 15°,
          Shift+R — против часовой, Del — удалить.
        </p>
      </Section>

      <Section title={`Выбранные корпуса (${selected.length})`}>
        {!selected.length && <p className="hint">Ничего не выбрано.</p>}

        {single && (
          <>
            <div className="stats">
              <div className="stat">
                <span className="label">Тип</span>
                <span className="value">{typologyById(single.typologyId).name}</span>
              </div>
              <div className="stat">
                <span className="label">Пятно</span>
                <span className="value">
                  {fmt(typologyById(single.typologyId).width * typologyById(single.typologyId).depth)} м²
                </span>
              </div>
              <div className="stat">
                <span className="label">Высота</span>
                <span className="value">
                  {fmt(single.floors * typologyById(single.typologyId).floorHeight, 1)} м
                </span>
              </div>
            </div>
            <div className="grid-2">
              <NumberField
                label="X"
                suffix="м"
                value={single.x}
                step={0.5}
                onChange={(x) => dispatch({ type: 'updateBuilding', id: single.id, patch: { x } })}
              />
              <NumberField
                label="Y"
                suffix="м"
                value={single.y}
                step={0.5}
                onChange={(y) => dispatch({ type: 'updateBuilding', id: single.id, patch: { y } })}
              />
            </div>
            <div className="grid-2">
              <NumberField
                label="Поворот"
                suffix="°"
                value={single.rotation}
                step={5}
                onChange={(rotation) => dispatch({ type: 'updateBuilding', id: single.id, patch: { rotation } })}
              />
              <NumberField
                label="Этажей"
                value={single.floors}
                min={1}
                max={60}
                onChange={(floors) => dispatch({ type: 'updateBuilding', id: single.id, patch: { floors } })}
              />
            </div>
          </>
        )}

        {selected.length > 0 && (
          <>
            <div className="btn-group">
              <button
                className="btn sm"
                onClick={() =>
                  selected.forEach((b) =>
                    dispatch({ type: 'updateBuilding', id: b.id, patch: { rotation: b.rotation + 90 } }),
                  )
                }
              >
                Повернуть 90°
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  selected.forEach((b) =>
                    dispatch({ type: 'updateBuilding', id: b.id, patch: { floors: Math.max(1, b.floors - 1) } }),
                  )
                }
              >
                −1 этаж
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  selected.forEach((b) => dispatch({ type: 'updateBuilding', id: b.id, patch: { floors: b.floors + 1 } }))
                }
              >
                +1 этаж
              </button>
            </div>
            <div className="btn-group">
              <button
                className="btn sm"
                onClick={() =>
                  selected.forEach((b) =>
                    dispatch({
                      type: 'addBuilding',
                      building: { ...b, id: `b${Math.random().toString(36).slice(2, 9)}`, x: b.x + 30, y: b.y },
                    }),
                  )
                }
              >
                Дублировать
              </button>
              <button className="btn sm" onClick={() => dispatch({ type: 'deleteSelected' })}>
                Удалить
              </button>
            </div>
          </>
        )}
      </Section>
    </>
  )
}
