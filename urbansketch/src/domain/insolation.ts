/**
 * Упрощённый расчёт инсоляции и теней.
 *
 * Модель: расчётный день 22 марта, истинное солнечное время, окна на середине
 * каждого фасада на высоте 1,5 м. Затенение считается по объёмам соседних
 * корпусов без учёта рельефа, окружающей застройки за пределами участка,
 * балконов и откосов. Это инструмент отбраковки вариантов на стадии оценки
 * участка, а не замена расчёту по СанПиН 1.2.3685-21.
 */
import { rotatePt, segmentsIntersect } from '../geo/polygon'
import type { Pt, Ring } from '../geo/types'
import { buildingRing } from './checks'
import { typologyById, type Building } from './typologies'

const RAD = Math.PI / 180

export interface SunPosition {
  /** Часы истинного солнечного времени. */
  hour: number
  /** Высота солнца над горизонтом, градусы. */
  altitude: number
  /** Азимут от севера по часовой стрелке, градусы. */
  azimuth: number
}

/** Склонение солнца для дня года. */
export const declination = (dayOfYear: number): number =>
  23.45 * Math.sin(RAD * ((360 * (284 + dayOfYear)) / 365))

/** 22 марта. */
export const EQUINOX_DAY = 81

export function sunPosition(latitude: number, dayOfYear: number, hour: number): SunPosition {
  const dec = declination(dayOfYear) * RAD
  const lat = latitude * RAD
  const H = (hour - 12) * 15 * RAD
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat))
  const azimuth = (azSouth / RAD + 180 + 360) % 360
  return { hour, altitude: altitude / RAD, azimuth }
}

/** Горизонтальный единичный вектор в сторону солнца (x — восток, y — север). */
export const sunVector = (azimuth: number): Pt => ({
  x: Math.sin(azimuth * RAD),
  y: Math.cos(azimuth * RAD),
})

export interface Facade {
  /** Сторона корпуса: 0 — юг локальных координат, далее против часовой. */
  index: number
  point: Pt
  /** Внешняя нормаль. */
  normal: Pt
  label: string
}

const CARDINALS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

export const cardinalOf = (normal: Pt): string => {
  const az = (Math.atan2(normal.x, normal.y) / RAD + 360) % 360
  return CARDINALS[Math.round(az / 45) % 8]
}

/** Середины четырёх фасадов здания с внешними нормалями. */
export function facadesOf(b: Building): Facade[] {
  const t = typologyById(b.typologyId)
  const local: { p: Pt; n: Pt }[] = [
    { p: { x: 0, y: -t.depth / 2 }, n: { x: 0, y: -1 } },
    { p: { x: t.width / 2, y: 0 }, n: { x: 1, y: 0 } },
    { p: { x: 0, y: t.depth / 2 }, n: { x: 0, y: 1 } },
    { p: { x: -t.width / 2, y: 0 }, n: { x: -1, y: 0 } },
  ]
  return local.map((item, index) => {
    const p = rotatePt(item.p, b.rotation)
    const n = rotatePt(item.n, b.rotation)
    // Точку выносим на 0,3 м от стены, чтобы собственный контур не считался преградой.
    const point = { x: b.x + p.x + n.x * 0.3, y: b.y + p.y + n.y * 0.3 }
    return { index, point, normal: n, label: cardinalOf(n) }
  })
}

const WINDOW_HEIGHT = 1.5
const RAY_LENGTH = 800

interface Obstacle {
  ring: Ring
  height: number
}

function rayBlocked(from: Pt, sunDir: Pt, altitudeDeg: number, obstacles: Obstacle[]): boolean {
  const tanAlt = Math.tan(altitudeDeg * RAD)
  if (tanAlt <= 0) return true
  const to = { x: from.x + sunDir.x * RAY_LENGTH, y: from.y + sunDir.y * RAY_LENGTH }
  for (const obstacle of obstacles) {
    let nearest = Infinity
    const ring = obstacle.ring
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      if (!segmentsIntersect(from, to, a, b)) continue
      const hit = intersectionPoint(from, to, a, b)
      if (!hit) continue
      nearest = Math.min(nearest, Math.hypot(hit.x - from.x, hit.y - from.y))
    }
    if (!Number.isFinite(nearest)) continue
    // Луч перекрыт, если верх препятствия выше линии взгляда на солнце.
    if (obstacle.height > WINDOW_HEIGHT + nearest * tanAlt) return true
  }
  return false
}

function intersectionPoint(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (Math.abs(d) < 1e-12) return null
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }
}

export interface FacadeInsolation {
  buildingId: string
  facade: Facade
  /** Максимальная непрерывная продолжительность инсоляции, ч. */
  continuousHours: number
  /** Суммарная продолжительность, ч. */
  totalHours: number
}

export interface InsolationReport {
  requiredHours: number
  facades: FacadeInsolation[]
  /** Фасады, не набирающие норматив (учитываются только те, что вообще могут освещаться). */
  failing: FacadeInsolation[]
  worstByBuilding: Record<string, FacadeInsolation>
}

export function computeInsolation(
  buildings: Building[],
  latitude: number,
  requiredHours: number,
  stepMinutes = 10,
): InsolationReport {
  const obstacles: Record<string, Obstacle> = {}
  for (const b of buildings) {
    const t = typologyById(b.typologyId)
    obstacles[b.id] = { ring: buildingRing(b), height: b.floors * t.floorHeight }
  }

  const step = stepMinutes / 60
  const facades: FacadeInsolation[] = []

  for (const b of buildings) {
    const t = typologyById(b.typologyId)
    if (t.kind !== 'residential') continue
    const others = buildings.filter((o) => o.id !== b.id).map((o) => obstacles[o.id])
    for (const facade of facadesOf(b)) {
      let total = 0
      let run = 0
      let best = 0
      for (let hour = 6; hour <= 18 + 1e-9; hour += step) {
        const sun = sunPosition(latitude, EQUINOX_DAY, hour)
        let lit = sun.altitude > 3
        if (lit) {
          const dir = sunVector(sun.azimuth)
          // Солнце должно быть со стороны фасада.
          if (facade.normal.x * dir.x + facade.normal.y * dir.y <= 0.09) lit = false
          else if (rayBlocked(facade.point, dir, sun.altitude, others)) lit = false
        }
        if (lit) {
          total += step
          run += step
          best = Math.max(best, run)
        } else {
          run = 0
        }
      }
      facades.push({ buildingId: b.id, facade, continuousHours: best, totalHours: total })
    }
  }

  const worstByBuilding: Record<string, FacadeInsolation> = {}
  for (const f of facades) {
    // Для корпуса важен лучший фасад: квартиры ориентируют на освещённую сторону.
    const current = worstByBuilding[f.buildingId]
    if (!current || f.continuousHours > current.continuousHours) worstByBuilding[f.buildingId] = f
  }

  const failing = Object.values(worstByBuilding).filter((f) => f.continuousHours + 1e-6 < requiredHours)

  return { requiredHours, facades, failing, worstByBuilding }
}

/** Контур тени здания для заданного положения солнца. */
export function shadowRing(b: Building, sun: SunPosition): Ring | null {
  if (sun.altitude <= 3) return null
  const t = typologyById(b.typologyId)
  const height = b.floors * t.floorHeight
  const length = height / Math.tan(sun.altitude * RAD)
  if (!Number.isFinite(length) || length <= 0) return null
  const dir = sunVector(sun.azimuth)
  const shift = { x: -dir.x * length, y: -dir.y * length }
  const base = buildingRing(b)
  const shifted = base.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y }))
  return convexHull([...base, ...shifted])
}

export function convexHull(points: Pt[]): Ring {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}
