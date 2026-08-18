/**
 * Генеративная посадка застройки.
 *
 * Три стратегии дают принципиально разные схемы квартала, каждая затем
 * дозаполняется свободными местами, пока не упрётся в норматив плотности,
 * процент застройки или в геометрию. Любой кандидат проверяется на попадание
 * в пятно застройки и на нормативные разрывы, поэтому вариант на выходе уже
 * проходит проверки из checks.ts.
 */
import { bboxOf, dist, dominantAngles, offsetPolys, ringDistance, ringInsidePolys } from '../geo/polygon'
import type { Poly, Pt, Ring } from '../geo/types'
import { buildingRing, requiredGap } from './checks'
import type { NormSet } from './norms'
import { buildableArea, type Project } from './project'
import { computeTep, type Tep } from './tep'
import { typologyById, type Building, type Typology } from './typologies'
import { computeInsolation } from './insolation'

export interface GenerateOptions {
  /** Жилые типологии, разрешённые к посадке. */
  typologyIds: string[]
  /** Ограничение этажности сверху (не выше нормативной). */
  maxFloors: number
  addKindergarten: boolean
  addSchool: boolean
  addParking: boolean
  /** Количество вариантов на выходе. */
  variants: number
  /** Доп. запас к нормативному разрыву, м. */
  extraGap: number
  /** Учитывать инсоляцию при оценке варианта. */
  respectInsolation: boolean
  seed: number
}

export const defaultGenerateOptions = (norms: NormSet): GenerateOptions => ({
  typologyIds: ['sec-3x24', 'sec-long', 'tower'],
  maxFloors: Math.min(norms.maxFloors, 17),
  addKindergarten: true,
  addSchool: false,
  addParking: true,
  variants: 3,
  extraGap: 0,
  respectInsolation: true,
  seed: 1,
})

export interface Variant {
  id: string
  label: string
  strategy: string
  buildings: Building[]
  tep: Tep
  /** Количество корпусов, не набирающих нормативную инсоляцию. */
  insolationFailures: number
  score: number
}

/** Детерминированный генератор псевдослучайных чисел. */
function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

interface Limits {
  /** Предел общей площади квартир, м². */
  sellable: number
  /** Предел площади застройки, м². */
  footprint: number
  maxFloors: number
  extraGap: number
}

class Placement {
  buildings: Building[] = []
  rings: Ring[] = []
  sellable = 0
  footprint = 0

  constructor(
    private readonly buildable: Poly[],
    private readonly limits: Limits,
  ) {}

  /** Достигнут ли предел по плотности или проценту застройки. */
  saturated(typology: Typology, floors: number): boolean {
    const footprint = typology.width * typology.depth
    if (this.footprint + footprint > this.limits.footprint) return true
    return this.sellable + footprint * floors * typology.sellableRatio > this.limits.sellable
  }

  floorsFor(typology: Typology): number {
    return Math.min(typology.floors, this.limits.maxFloors)
  }

  /** Пробует поставить корпус; возвращает true, если удалось. */
  tryPlace(typology: Typology, center: Pt, rotation: number, respectLimits = true): boolean {
    const floors = this.floorsFor(typology)
    if (respectLimits && this.saturated(typology, floors)) return false
    const candidate: Building = {
      id: nextId(),
      typologyId: typology.id,
      x: center.x,
      y: center.y,
      rotation,
      floors,
    }
    const ring = buildingRing(candidate)
    if (!ringInsidePolys(ring, this.buildable)) return false
    for (let i = 0; i < this.buildings.length; i++) {
      const gap = requiredGap(candidate, this.buildings[i]) + this.limits.extraGap
      if (ringDistance(ring, this.rings[i]) < gap - 0.05) return false
    }
    this.buildings.push(candidate)
    this.rings.push(ring)
    const footprint = typology.width * typology.depth
    this.footprint += footprint
    this.sellable += footprint * floors * typology.sellableRatio
    return true
  }
}

let idCounter = 0
const nextId = () => `b${Date.now().toString(36)}${(idCounter++).toString(36)}`

/* ------------------------------- Стратегии -------------------------------- */

/** Соцобъект или паркинг — во внутреннюю часть квартала, ближе к центру. */
function placeInterior(typology: Typology, place: Placement, buildable: Poly[], angles: number[]): boolean {
  const box = bboxOf(buildable.map((p) => p.outer))
  const center: Pt = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const step = 6
  const candidates: { point: Pt; rotation: number; cost: number }[] = []
  for (let x = box.minX; x <= box.maxX; x += step) {
    for (let y = box.minY; y <= box.maxY; y += step) {
      for (const rotation of angles.slice(0, 2)) {
        candidates.push({ point: { x, y }, rotation, cost: dist({ x, y }, center) })
      }
    }
  }
  candidates.sort((a, b) => a.cost - b.cost)
  for (const c of candidates) {
    // Соцобъекты ставим вне лимита плотности: они не дают продаваемой площади.
    if (place.tryPlace(typology, c.point, c.rotation, false)) return true
  }
  return false
}

/** Периметральная посадка: корпуса вдоль контура пятна, кольцами внутрь. */
function placePerimeter(
  typologies: Typology[],
  place: Placement,
  buildable: Poly[],
  phase: number,
  reverse: boolean,
) {
  let zone = buildable
  const maxRings = 5
  const depth = Math.max(...typologies.map((t) => t.depth))

  for (let ring = 0; ring < maxRings; ring++) {
    if (!zone.length) break
    const contours: Ring[] = zone.flatMap((poly) => [poly.outer, ...poly.holes])
    for (const contour of contours) {
      for (let e = 0; e < contour.length; e++) {
        const a = contour[e]
        const b = contour[(e + 1) % contour.length]
        const edgeLen = dist(a, b)
        if (edgeLen < 14) continue
        const ux = (b.x - a.x) / edgeLen
        const uy = (b.y - a.y) / edgeLen
        // Clipper отдаёт внешние контуры против часовой стрелки — нормаль внутрь.
        const nx = -uy
        const ny = ux
        const angle = (Math.atan2(uy, ux) * 180) / Math.PI

        let cursor = phase
        let step = 0
        while (cursor < edgeLen && step++ < 300) {
          const order = reverse ? [...typologies].reverse() : typologies
          const typology = order[(ring + step) % order.length]
          if (cursor + typology.width > edgeLen) {
            cursor += 4
            continue
          }
          const along = cursor + typology.width / 2
          const center: Pt = {
            x: a.x + ux * along + nx * (typology.depth / 2),
            y: a.y + uy * along + ny * (typology.depth / 2),
          }
          if (place.tryPlace(typology, center, angle)) cursor = along + typology.width / 2 + 6
          else cursor += 4
        }
      }
    }
    zone = offsetPolys(zone, -(depth + 20))
  }
}

/** Строчная застройка: параллельные ряды с бытовым разрывом между ними. */
function placeRows(typologies: Typology[], place: Placement, buildable: Poly[], angle: number, phase: number) {
  const box = bboxOf(buildable.map((p) => p.outer))
  const center: Pt = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const diagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY)
  const rad = (angle * Math.PI) / 180
  const along: Pt = { x: Math.cos(rad), y: Math.sin(rad) }
  const across: Pt = { x: -Math.sin(rad), y: Math.cos(rad) }
  const depth = Math.max(...typologies.map((t) => t.depth))
  const rowStep = depth + 20

  for (let offset = -diagonal / 2; offset <= diagonal / 2; offset += rowStep) {
    let cursor = -diagonal / 2 + phase
    let step = 0
    while (cursor < diagonal / 2 && step++ < 400) {
      const typology = typologies[step % typologies.length]
      const t = cursor + typology.width / 2
      const point: Pt = {
        x: center.x + along.x * t + across.x * offset,
        y: center.y + along.y * t + across.y * offset,
      }
      if (place.tryPlace(typology, point, angle)) cursor = t + typology.width / 2 + 6
      else cursor += 5
    }
  }
}

/** Дозаполнение оставшихся мест по сетке — добирает плотность до норматива. */
function fillRemaining(typologies: Typology[], place: Placement, buildable: Poly[], angles: number[]) {
  const box = bboxOf(buildable.map((p) => p.outer))
  const step = 5
  // Крупные корпуса пробуем первыми: они дают больше площади на одно место.
  const order = [...typologies].sort((a, b) => b.width * b.depth * b.floors - a.width * a.depth * a.floors)
  for (const typology of order) {
    for (const rotation of angles) {
      for (let x = box.minX; x <= box.maxX; x += step) {
        for (let y = box.minY; y <= box.maxY; y += step) {
          if (place.saturated(typology, place.floorsFor(typology))) return
          place.tryPlace(typology, { x, y }, rotation)
        }
      }
    }
  }
}

/* -------------------------------- Сборка ---------------------------------- */

export function generateVariants(project: Project, norms: NormSet, options: GenerateOptions): Variant[] {
  const buildable = buildableArea(project)
  if (!buildable.length) return []

  const baseTep = computeTep({ ...project, buildings: [] }, norms, 0)
  const parcelHa = Math.max(1e-6, baseTep.parcelHa)
  const limits: Limits = {
    sellable: norms.maxDensity * parcelHa,
    footprint: (norms.maxBuiltUpPercent / 100) * baseTep.parcelArea,
    maxFloors: Math.min(options.maxFloors, norms.maxFloors),
    extraGap: options.extraGap,
  }

  const residential = options.typologyIds.map(typologyById).filter((t) => t.kind === 'residential')
  if (!residential.length) return []

  const parcelAngles = dominantAngles(project.parcel)
  const angles = [...new Set([...parcelAngles.slice(0, 2), 0, 90])].slice(0, 4)
  const random = rng(options.seed)

  const strategies = [
    {
      label: 'Периметральный квартал',
      describe: 'корпуса вдоль границ, двор внутри',
      run: (place: Placement) => {
        placePerimeter(residential, place, buildable, 4 + Math.floor(random() * 4), false)
        fillRemaining(residential, place, buildable, angles)
      },
    },
    {
      label: 'Строчная застройка',
      describe: 'параллельные ряды с широтной ориентацией',
      run: (place: Placement) => {
        placeRows(residential, place, buildable, angles[0] ?? 0, Math.floor(random() * 8))
        fillRemaining(residential, place, buildable, angles)
      },
    },
    {
      label: 'Смешанная: башни и секции',
      describe: 'башни в глубине, секции по границе',
      run: (place: Placement) => {
        const towers = residential.filter((t) => t.width / t.depth < 1.4)
        const slabs = residential.filter((t) => t.width / t.depth >= 1.4)
        placePerimeter(slabs.length ? slabs : residential, place, buildable, 8, true)
        fillRemaining(towers.length ? towers : residential, place, buildable, angles)
        fillRemaining(residential, place, buildable, angles)
      },
    },
  ]

  const variants: Variant[] = []
  const count = Math.max(1, Math.min(options.variants, strategies.length))

  for (let i = 0; i < count; i++) {
    const strategy = strategies[i]
    const place = new Placement(buildable, limits)

    if (options.addSchool) placeInterior(typologyById('school'), place, buildable, angles)
    if (options.addKindergarten) placeInterior(typologyById('kindergarten'), place, buildable, angles)
    if (options.addParking) placeInterior(typologyById('parking'), place, buildable, angles)

    strategy.run(place)

    const tep = computeTep({ ...project, buildings: place.buildings }, norms, 0)
    const failures = options.respectInsolation
      ? computeInsolation(place.buildings, project.latitude, norms.insolationHours, 20).failing.length
      : 0

    variants.push({
      id: `v${i + 1}`,
      label: `Вариант ${'ABC'[i]} — ${strategy.label}`,
      strategy: strategy.describe,
      buildings: place.buildings,
      tep,
      insolationFailures: failures,
      // Инсоляционный брак дороже нескольких сотен метров площади.
      score: tep.sellableArea - failures * 2000,
    })
  }

  return variants.sort((a, b) => b.score - a.score)
}
