import { cleanRing, differencePolys, ensureCcw, offsetPoly, ringToPoly } from '../geo/polygon'
import type { Poly, Ring } from '../geo/types'
import type { Building } from './typologies'

export interface Project {
  name: string
  /** Контур участка в локальных метрах. */
  parcel: Ring
  /** Кадастровый номер / примечание, если пришло из импорта. */
  cadastralNumber: string
  /** Отступ застройки от границ участка, м. */
  setback: number
  /** Индексы сторон контура, отнесённых к красным линиям (увеличенный отступ). */
  redLineEdges: number[]
  /** Отступ от красных линий, м. */
  redLineSetback: number
  normSetId: string
  /** Широта участка (по умолчанию берётся из норм-набора). */
  latitude: number
  buildings: Building[]
}

export const emptyProject = (): Project => ({
  name: 'Новый участок',
  parcel: [],
  cadastralNumber: '',
  setback: 3,
  redLineEdges: [],
  redLineSetback: 6,
  normSetId: 'ru-default',
  latitude: 55.75,
  buildings: [],
})

/**
 * Пятно застройки: контур участка, смещённый внутрь на нормативный отступ,
 * с дополнительным вырезом вдоль сторон, отмеченных как красные линии.
 */
export function buildableArea(project: Project): Poly[] {
  const ring = cleanRing(project.parcel)
  if (ring.length < 3) return []
  const base = offsetPoly(ringToPoly(ensureCcw(ring)), -Math.max(0, project.setback))
  const extra = project.redLineSetback - project.setback
  if (!project.redLineEdges.length || extra <= 0) return base
  // Полосы вдоль красных линий вычитаются из базового пятна.
  const ccw = ensureCcw(ring)
  const strips: Poly[] = []
  for (const index of project.redLineEdges) {
    const a = ccw[index % ccw.length]
    const b = ccw[(index + 1) % ccw.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.01) continue
    // Нормаль внутрь участка для контура против часовой стрелки.
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    const d = project.redLineSetback
    strips.push({
      outer: [
        { x: a.x - nx, y: a.y - ny },
        { x: b.x - nx, y: b.y - ny },
        { x: b.x + nx * d, y: b.y + ny * d },
        { x: a.x + nx * d, y: a.y + ny * d },
      ],
      holes: [],
    })
  }
  if (!strips.length) return base
  return differencePolys(base, strips)
}
