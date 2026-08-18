import { rectRing, ringArea, unionPolys, polysArea, ringToPoly } from '../geo/polygon'
import type { NormSet } from './norms'
import type { Project } from './project'
import { buildingHeight, typologyById, type Building, type BuildingKind, type Typology } from './typologies'

export interface BuildingMetrics {
  building: Building
  typology: Typology
  footprint: number
  grossFloorArea: number
  sellableArea: number
  height: number
}

export interface Tep {
  parcelArea: number
  parcelHa: number
  buildableArea: number
  footprintArea: number
  builtUpPercent: number
  /** Поэтажная площадь всех зданий, м². */
  grossFloorArea: number
  /** Поэтажная площадь жилых корпусов, м². */
  residentialGfa: number
  /** Общая площадь квартир (продаваемая), м². */
  sellableArea: number
  /** Продаваемая коммерция, м². */
  commercialArea: number
  /** Плотность жилой застройки, м² общей площади квартир на га. */
  density: number
  /** Расчётное население, чел. */
  residents: number
  /** Средняя этажность жилых корпусов, взвешенная по площади. */
  averageFloors: number
  maxFloors: number
  byKind: Record<BuildingKind, { count: number; footprint: number; gfa: number }>
  demand: {
    kindergartenSeats: number
    schoolSeats: number
    parkingSpaces: number
    greenArea: number
    playgroundArea: number
  }
  provided: {
    kindergartenSeats: number
    schoolSeats: number
    parkingSpaces: number
  }
  /** Баланс территории, м². */
  balance: {
    builtUp: number
    surfaceParking: number
    playgrounds: number
    greenRequired: number
    drivewaysAndOther: number
    free: number
    greenDeficit: number
  }
  perBuilding: BuildingMetrics[]
}

const emptyByKind = (): Tep['byKind'] => ({
  residential: { count: 0, footprint: 0, gfa: 0 },
  kindergarten: { count: 0, footprint: 0, gfa: 0 },
  school: { count: 0, footprint: 0, gfa: 0 },
  parking: { count: 0, footprint: 0, gfa: 0 },
  commercial: { count: 0, footprint: 0, gfa: 0 },
})

export function buildingMetrics(building: Building): BuildingMetrics {
  const typology = typologyById(building.typologyId)
  const footprint = typology.width * typology.depth
  const grossFloorArea = footprint * building.floors
  return {
    building,
    typology,
    footprint,
    grossFloorArea,
    sellableArea: grossFloorArea * typology.sellableRatio,
    height: buildingHeight(building, typology),
  }
}

/** Площадь застройки с учётом возможных наложений корпусов. */
function unionFootprint(buildings: Building[]): number {
  if (!buildings.length) return 0
  const polys = buildings.map((b) => {
    const t = typologyById(b.typologyId)
    return ringToPoly(rectRing({ x: b.x, y: b.y }, t.width, t.depth, b.rotation))
  })
  return polysArea(unionPolys(polys))
}

export function computeTep(project: Project, norms: NormSet, buildable: number): Tep {
  const parcelArea = ringArea(project.parcel)
  const parcelHa = parcelArea / 10000
  const perBuilding = project.buildings.map(buildingMetrics)

  const byKind = emptyByKind()
  let grossFloorArea = 0
  let residentialGfa = 0
  let sellableArea = 0
  let commercialArea = 0
  let floorsWeighted = 0
  let maxFloors = 0
  const provided = { kindergartenSeats: 0, schoolSeats: 0, parkingSpaces: 0 }

  for (const m of perBuilding) {
    const kind = m.typology.kind
    byKind[kind].count += 1
    byKind[kind].footprint += m.footprint
    byKind[kind].gfa += m.grossFloorArea
    grossFloorArea += m.grossFloorArea
    if (kind === 'residential') {
      residentialGfa += m.grossFloorArea
      sellableArea += m.sellableArea
      floorsWeighted += m.building.floors * m.footprint
      maxFloors = Math.max(maxFloors, m.building.floors)
    }
    if (kind === 'commercial') commercialArea += m.sellableArea
    if (kind === 'kindergarten') provided.kindergartenSeats += m.typology.capacity ?? 0
    if (kind === 'school') provided.schoolSeats += m.typology.capacity ?? 0
    if (kind === 'parking') provided.parkingSpaces += m.typology.capacity ?? 0
  }

  const footprintArea = unionFootprint(project.buildings)
  const residentialFootprint = byKind.residential.footprint
  const residents = sellableArea / norms.areaPerResident
  const demand = {
    kindergartenSeats: (residents * norms.kindergartenPer1000) / 1000,
    schoolSeats: (residents * norms.schoolPer1000) / 1000,
    parkingSpaces: (residents * norms.parkingPer1000) / 1000,
    greenArea: residents * norms.greenPerResident,
    playgroundArea: residents * norms.playgroundPerResident,
  }

  // Открытые парковки: то, что не покрыто паркингами, по 25 м² на машино-место с проездами.
  const surfaceParking = Math.max(0, demand.parkingSpaces - provided.parkingSpaces) * 25
  const free = Math.max(0, parcelArea - footprintArea)
  const drivewaysAndOther = Math.max(0, free - surfaceParking - demand.playgroundArea - demand.greenArea)
  const greenDeficit = Math.max(0, demand.greenArea + demand.playgroundArea + surfaceParking - free)

  return {
    parcelArea,
    parcelHa,
    buildableArea: buildable,
    footprintArea,
    builtUpPercent: parcelArea > 0 ? (footprintArea / parcelArea) * 100 : 0,
    grossFloorArea,
    residentialGfa,
    sellableArea,
    commercialArea,
    density: parcelHa > 0 ? sellableArea / parcelHa : 0,
    residents,
    averageFloors: residentialFootprint > 0 ? floorsWeighted / residentialFootprint : 0,
    maxFloors,
    byKind,
    demand,
    provided,
    balance: {
      builtUp: footprintArea,
      surfaceParking,
      playgrounds: demand.playgroundArea,
      greenRequired: demand.greenArea,
      drivewaysAndOther,
      free,
      greenDeficit,
    },
    perBuilding,
  }
}
