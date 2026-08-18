import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { bboxOf, dist } from '../geo/polygon'
import type { Poly, Pt, Ring } from '../geo/types'
import { buildingRing } from '../domain/checks'
import { EQUINOX_DAY, shadowRing, sunPosition } from '../domain/insolation'
import type { InsolationReport } from '../domain/insolation'
import { typologyById } from '../domain/typologies'
import { makeBuilding, useStore } from '../app/store'
import { fmtHour } from './primitives'

interface View {
  cx: number
  cy: number
  k: number
}

const ringPath = (ring: Ring) => `${ring.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} Z`
const polyPath = (poly: Poly) => [poly.outer, ...poly.holes].map(ringPath).join(' ')

/** Шаг сетки размерных подписей в зависимости от масштаба. */
const labelScale = (k: number) => 1 / k

export function Plan({
  buildable,
  insolation,
  problemIds,
}: {
  buildable: Poly[]
  insolation: InsolationReport | null
  problemIds: Set<string>
}) {
  const { state, dispatch } = useStore()
  const { project, tool, draft, selectedIds, showBuildable, showShadows, showInsolation, shadowHour } = state

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 2 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const dragRef = useRef<{
    mode: 'pan' | 'move'
    start: Pt
    origin: View
    moved: boolean
    snapshot: typeof project
  } | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.max(200, width), h: Math.max(200, height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fit = useCallback(() => {
    if (!project.parcel.length) return
    const box = bboxOf([project.parcel])
    const w = box.maxX - box.minX
    const h = box.maxY - box.minY
    const k = Math.min(size.w / (w * 1.25 || 1), size.h / (h * 1.25 || 1))
    setView({ cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, k: Math.max(0.05, k) })
  }, [project.parcel, size.w, size.h])

  const parcelKey = project.parcel.length ? `${project.parcel.length}:${project.parcel[0]?.x.toFixed(1)}` : ''
  useEffect(() => {
    fit()
    // Пересчитываем посадку вида только при смене контура участка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelKey])

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      return {
        x: (sx - size.w / 2) / view.k + view.cx,
        y: (size.h / 2 - sy) / view.k + view.cy,
      }
    },
    [size.w, size.h, view],
  )

  const snap = (p: Pt): Pt => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 })

  /* ------------------------------ Ввод мышью ------------------------------ */

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const before = toWorld(e.clientX, e.clientY)
    const k = Math.max(0.05, Math.min(30, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    // Точка под курсором остаётся на месте.
    setView({
      k,
      cx: before.x - (sx - size.w / 2) / k,
      cy: before.y - (size.h / 2 - sy) / k,
    })
  }

  const hitBuilding = (world: Pt): string | null => {
    for (let i = project.buildings.length - 1; i >= 0; i--) {
      const b = project.buildings[i]
      const t = typologyById(b.typologyId)
      const dx = world.x - b.x
      const dy = world.y - b.y
      const a = (-b.rotation * Math.PI) / 180
      const lx = dx * Math.cos(a) - dy * Math.sin(a)
      const ly = dx * Math.sin(a) + dy * Math.cos(a)
      if (Math.abs(lx) <= t.width / 2 && Math.abs(ly) <= t.depth / 2) return b.id
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)

    if (tool === 'draw' && e.button === 0) {
      dispatch({ type: 'draftAdd', point: snap(world) })
      return
    }
    if (tool === 'place' && e.button === 0) {
      const snapped = snap(world)
      dispatch({
        type: 'addBuilding',
        building: makeBuilding(state.placingTypologyId, snapped.x, snapped.y, 0),
      })
      return
    }
    if (e.button === 0) {
      const hit = hitBuilding(world)
      if (hit) {
        const ids = e.shiftKey
          ? selectedIds.includes(hit)
            ? selectedIds.filter((id) => id !== hit)
            : [...selectedIds, hit]
          : selectedIds.includes(hit)
            ? selectedIds
            : [hit]
        dispatch({ type: 'select', ids })
        dragRef.current = { mode: 'move', start: world, origin: view, moved: false, snapshot: project }
        return
      }
      if (!e.shiftKey) dispatch({ type: 'select', ids: [] })
    }
    dragRef.current = {
      mode: 'pan',
      start: { x: e.clientX, y: e.clientY },
      origin: view,
      moved: false,
      snapshot: project,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY)
    setCursor(world)
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'pan') {
      const dx = (e.clientX - drag.start.x) / view.k
      const dy = (e.clientY - drag.start.y) / view.k
      setView({ ...drag.origin, cx: drag.origin.cx - dx, cy: drag.origin.cy + dy })
      drag.moved = true
      return
    }
    const dx = world.x - drag.start.x
    const dy = world.y - drag.start.y
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
    dispatch({ type: 'moveSelected', dx, dy, history: false })
    drag.start = world
    drag.moved = true
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.mode === 'move' && drag.moved) {
      // Всё перетаскивание попадает в историю одним шагом.
      dispatch({ type: 'pushHistory', snapshot: drag.snapshot })
    }
  }

  const onDoubleClick = () => {
    if (tool === 'draw') dispatch({ type: 'draftCommit' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      if (e.key === 'Escape') dispatch({ type: 'draftCancel' })
      if (e.key === 'Enter' && tool === 'draw') dispatch({ type: 'draftCommit' })
      if (e.key === 'Delete' || e.key === 'Backspace') dispatch({ type: 'deleteSelected' })
      if ((e.key === 'r' || e.key === 'к') && selectedIds.length) {
        for (const id of selectedIds) {
          const b = project.buildings.find((x) => x.id === id)
          if (b) dispatch({ type: 'updateBuilding', id, patch: { rotation: b.rotation + (e.shiftKey ? -15 : 15) } })
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      }
      if (e.key === 'f') fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, tool, selectedIds, project.buildings, fit])

  /* -------------------------------- Отрисовка ------------------------------ */

  const sun = useMemo(() => sunPosition(project.latitude, EQUINOX_DAY, shadowHour), [project.latitude, shadowHour])

  const shadows = useMemo(() => {
    if (!showShadows) return []
    return project.buildings
      .map((b) => ({ id: b.id, ring: shadowRing(b, sun) }))
      .filter((s): s is { id: string; ring: Ring } => Boolean(s.ring))
  }, [showShadows, project.buildings, sun])

  const ls = labelScale(view.k)
  const transform = `translate(${size.w / 2} ${size.h / 2}) scale(${view.k} ${-view.k}) translate(${-view.cx} ${-view.cy})`

  const edgeLabels = project.parcel.map((a, i) => {
    const b = project.parcel[(i + 1) % project.parcel.length]
    const length = dist(a, b)
    return { i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length }
  })

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`plan ${tool}`}
        width={size.w}
        height={size.h}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <g transform={transform}>
          {showBuildable &&
            buildable.map((poly, i) => (
              <path
                key={`ba${i}`}
                d={polyPath(poly)}
                fill="#dbe6ef"
                fillOpacity={0.55}
                stroke="#7f9db8"
                strokeWidth={0.6 * ls}
                strokeDasharray={`${3 * ls} ${2 * ls}`}
              />
            ))}

          {shadows.map((s) => (
            <path key={`sh${s.id}`} d={ringPath(s.ring)} fill="#1f2937" fillOpacity={0.14} stroke="none" />
          ))}

          {project.parcel.length >= 3 && (
            <path d={ringPath(project.parcel)} fill="none" stroke="#111827" strokeWidth={1.4 * ls} />
          )}

          {project.parcel.map((p, i) => (
            <circle key={`pv${i}`} cx={p.x} cy={p.y} r={2 * ls} fill="#111827" />
          ))}

          {project.buildings.map((b) => {
            const t = typologyById(b.typologyId)
            const selected = selectedIds.includes(b.id)
            const problem = problemIds.has(b.id)
            return (
              <g key={b.id}>
                <path
                  d={ringPath(buildingRing(b))}
                  fill={t.color}
                  fillOpacity={0.92}
                  stroke={problem ? '#b4443a' : selected ? '#1f5f8b' : '#31404f'}
                  strokeWidth={(selected || problem ? 1.6 : 0.6) * ls}
                />
                <g transform={`translate(${b.x} ${b.y}) scale(${ls} ${-ls})`}>
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#0f172a">
                    {b.floors}
                  </text>
                </g>
              </g>
            )
          })}

          {showInsolation &&
            insolation?.facades.map((f, i) => (
              <circle
                key={`ins${i}`}
                cx={f.facade.point.x}
                cy={f.facade.point.y}
                r={2.2 * ls}
                fill={f.continuousHours + 1e-6 >= (insolation?.requiredHours ?? 2) ? '#2f7a4d' : '#b4443a'}
              />
            ))}

          {draft.length > 0 && (
            <>
              <path
                d={`M${draft.map((p) => `${p.x} ${p.y}`).join(' L')}${cursor ? ` L${cursor.x} ${cursor.y}` : ''}`}
                fill="none"
                stroke="#1f5f8b"
                strokeWidth={1.2 * ls}
                strokeDasharray={`${4 * ls} ${2 * ls}`}
              />
              {draft.map((p, i) => (
                <circle key={`d${i}`} cx={p.x} cy={p.y} r={2.5 * ls} fill="#1f5f8b" />
              ))}
            </>
          )}

          {view.k > 0.7 &&
            edgeLabels.map((e) => (
              <g key={`el${e.i}`} transform={`translate(${e.x} ${e.y}) scale(${ls} ${-ls})`}>
                <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#5c6675">
                  {e.length.toFixed(1)}
                </text>
              </g>
            ))}
        </g>

        {/* Стрелка севера */}
        <g transform={`translate(${size.w - 46} 42)`}>
          <line x1={0} y1={16} x2={0} y2={-16} stroke="#31404f" strokeWidth={1.2} />
          <polygon points="0,-20 4,-10 -4,-10" fill="#31404f" />
          <text x={0} y={30} textAnchor="middle" fontSize={11} fill="#5c6675">
            С
          </text>
        </g>
      </svg>

      {!project.parcel.length && (
        <div className="canvas-empty">
          <h2>Участок не задан</h2>
          <p>
            Импортируйте кадастровый XML, GeoJSON или DXF слева —
            <br />
            либо нарисуйте контур инструментом «Контур».
          </p>
        </div>
      )}

      <div className="canvas-overlay">
        <span>М 1:{Math.round(1000 / view.k) * 1}</span>
        <span>
          {cursor ? `X ${cursor.x.toFixed(1)} · Y ${cursor.y.toFixed(1)} м` : '—'}
        </span>
        {showShadows && (
          <span>
            {fmtHour(shadowHour)} · солнце {sun.altitude.toFixed(0)}° / {sun.azimuth.toFixed(0)}°
          </span>
        )}
      </div>

      <div className="canvas-tools">
        <button
          className={`btn sm${tool === 'select' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'setTool', tool: 'select' })}
          title="Выбор и перемещение (Del — удалить, R — поворот)"
        >
          Выбор
        </button>
        <button
          className={`btn sm${tool === 'draw' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'setTool', tool: 'draw' })}
          title="Рисование контура участка: клик — точка, Enter/двойной клик — замкнуть"
        >
          Контур
        </button>
        <button
          className={`btn sm${tool === 'place' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'setTool', tool: 'place' })}
          title="Постановка выбранной типологии по клику"
        >
          Посадка
        </button>
        <button className="btn sm" onClick={fit} title="Вписать участок в экран (F)">
          Вписать
        </button>
      </div>
    </div>
  )
}
