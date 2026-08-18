import { rectRing, ringDistance, ringInsidePolys, rotatePt } from '../geo/polygon'
import type { Poly, Pt } from '../geo/types'
import { domesticGap, endWallGap, fireGap, type NormSet } from './norms'
import type { Project } from './project'
import { typologyById, type Building } from './typologies'
import type { Tep } from './tep'

export type Severity = 'ok' | 'warning' | 'error'

export interface CheckResult {
  id: string
  title: string
  severity: Severity
  message: string
  /** Здания, к которым относится замечание. */
  buildingIds: string[]
}

const fmt = (n: number, digits = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits })

export const buildingRing = (b: Building) => {
  const t = typologyById(b.typologyId)
  return rectRing({ x: b.x, y: b.y }, t.width, t.depth, b.rotation)
}

/** Единичный вектор длинной стороны здания. */
const longAxis = (b: Building): Pt => rotatePt({ x: 1, y: 0 }, b.rotation)

/**
 * Обращены ли здания друг к другу длинными сторонами.
 * Если да — действует бытовой разрыв, иначе — разрыв «торец-фасад».
 */
function facingLongSides(a: Building, b: Building): boolean {
  const axisA = longAxis(a)
  const axisB = longAxis(b)
  const between = { x: b.x - a.x, y: b.y - a.y }
  const len = Math.hypot(between.x, between.y) || 1
  const dir = { x: between.x / len, y: between.y / len }
  // Направление между центрами почти перпендикулярно обеим длинным осям.
  const perpA = Math.abs(axisA.x * dir.x + axisA.y * dir.y) < 0.5
  const perpB = Math.abs(axisB.x * dir.x + axisB.y * dir.y) < 0.5
  return perpA && perpB
}

/** Минимально требуемый разрыв между двумя зданиями, м. */
export function requiredGap(a: Building, b: Building): number {
  const ta = typologyById(a.typologyId)
  const tb = typologyById(b.typologyId)
  const fire = fireGap(ta.fireClass, tb.fireClass)
  const bothResidential = ta.kind === 'residential' && tb.kind === 'residential'
  if (!bothResidential) return fire
  const sanitary = facingLongSides(a, b) ? domesticGap(a.floors, b.floors) : endWallGap
  return Math.max(fire, sanitary)
}

export interface CheckContext {
  project: Project
  norms: NormSet
  buildable: Poly[]
  tep: Tep
}

export function runChecks({ project, norms, buildable, tep }: CheckContext): CheckResult[] {
  const results: CheckResult[] = []
  const buildings = project.buildings

  // 1. Посадка в границах пятна застройки.
  const outside = buildings.filter((b) => !ringInsidePolys(buildingRing(b), buildable))
  results.push(
    outside.length
      ? {
          id: 'inside-buildable',
          title: 'Размещение в пятне застройки',
          severity: 'error',
          message: `${outside.length} корпус(ов) выходят за пятно застройки (отступ ${fmt(project.setback)} м от границ участка).`,
          buildingIds: outside.map((b) => b.id),
        }
      : {
          id: 'inside-buildable',
          title: 'Размещение в пятне застройки',
          severity: 'ok',
          message: 'Все корпуса внутри пятна застройки.',
          buildingIds: [],
        },
  )

  // 2. Разрывы между зданиями.
  const violations: { a: Building; b: Building; actual: number; required: number }[] = []
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i]
      const b = buildings[j]
      const actual = ringDistance(buildingRing(a), buildingRing(b))
      const required = requiredGap(a, b)
      if (actual < required - 0.05) violations.push({ a, b, actual, required })
    }
  }
  results.push(
    violations.length
      ? {
          id: 'gaps',
          title: 'Противопожарные и бытовые разрывы',
          severity: 'error',
          message: `${violations.length} нарушени(й): минимальное ${fmt(
            Math.min(...violations.map((v) => v.actual)),
          )} м при требуемых ${fmt(Math.max(...violations.map((v) => v.required)))} м.`,
          buildingIds: [...new Set(violations.flatMap((v) => [v.a.id, v.b.id]))],
        }
      : {
          id: 'gaps',
          title: 'Противопожарные и бытовые разрывы',
          severity: 'ok',
          message: 'Разрывы между корпусами соблюдены.',
          buildingIds: [],
        },
  )

  // 3. Плотность.
  results.push({
    id: 'density',
    title: 'Плотность жилой застройки',
    severity: tep.density > norms.maxDensity ? 'error' : tep.density > norms.maxDensity * 0.95 ? 'warning' : 'ok',
    message: `${fmt(tep.density, 0)} м²/га при норме до ${fmt(norms.maxDensity, 0)} м²/га.`,
    buildingIds: [],
  })

  // 4. Процент застройки.
  results.push({
    id: 'built-up',
    title: 'Процент застройки',
    severity: tep.builtUpPercent > norms.maxBuiltUpPercent ? 'error' : 'ok',
    message: `${fmt(tep.builtUpPercent)} % при норме до ${fmt(norms.maxBuiltUpPercent)} %.`,
    buildingIds: [],
  })

  // 5. Этажность.
  const tooTall = buildings.filter((b) => b.floors > norms.maxFloors)
  results.push({
    id: 'floors',
    title: 'Предельная этажность',
    severity: tooTall.length ? 'error' : 'ok',
    message: tooTall.length
      ? `${tooTall.length} корпус(ов) выше ${norms.maxFloors} эт.`
      : `Максимум ${tep.maxFloors || 0} эт. при норме ${norms.maxFloors} эт.`,
    buildingIds: tooTall.map((b) => b.id),
  })

  // 6. Социальная инфраструктура.
  const dou = tep.provided.kindergartenSeats - tep.demand.kindergartenSeats
  results.push({
    id: 'kindergarten',
    title: 'Места в детских садах',
    severity: dou < 0 ? 'warning' : 'ok',
    message: `Требуется ${fmt(tep.demand.kindergartenSeats, 0)} мест, размещено ${fmt(
      tep.provided.kindergartenSeats,
      0,
    )}${dou < 0 ? ` — дефицит ${fmt(-dou, 0)}` : ''}.`,
    buildingIds: [],
  })

  const school = tep.provided.schoolSeats - tep.demand.schoolSeats
  results.push({
    id: 'school',
    title: 'Места в школах',
    severity: school < 0 ? 'warning' : 'ok',
    message: `Требуется ${fmt(tep.demand.schoolSeats, 0)} мест, размещено ${fmt(tep.provided.schoolSeats, 0)}${
      school < 0 ? ` — дефицит ${fmt(-school, 0)}` : ''
    }.`,
    buildingIds: [],
  })

  // 7. Парковки и озеленение.
  results.push({
    id: 'parking',
    title: 'Машино-места',
    severity: tep.provided.parkingSpaces < tep.demand.parkingSpaces ? 'warning' : 'ok',
    message: `Требуется ${fmt(tep.demand.parkingSpaces, 0)} м/м, в паркингах ${fmt(
      tep.provided.parkingSpaces,
      0,
    )}, на открытых стоянках нужно ${fmt(tep.balance.surfaceParking, 0)} м².`,
    buildingIds: [],
  })

  results.push({
    id: 'green',
    title: 'Озеленение и площадки',
    severity: tep.balance.greenDeficit > 0 ? 'error' : 'ok',
    message:
      tep.balance.greenDeficit > 0
        ? `Свободной территории не хватает на ${fmt(tep.balance.greenDeficit, 0)} м².`
        : `Свободная территория ${fmt(tep.balance.free, 0)} м² покрывает озеленение и площадки.`,
    buildingIds: [],
  })

  return results
}

export const worstSeverity = (results: CheckResult[]): Severity =>
  results.some((r) => r.severity === 'error') ? 'error' : results.some((r) => r.severity === 'warning') ? 'warning' : 'ok'
