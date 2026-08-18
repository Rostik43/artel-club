import type { FireClass } from './norms'

export type BuildingKind = 'residential' | 'kindergarten' | 'school' | 'parking' | 'commercial'

/** Типовой объект-«кирпич», которым идёт посадка. */
export interface Typology {
  id: string
  name: string
  kind: BuildingKind
  /** Габарит вдоль главной оси (длина секции), м. */
  width: number
  /** Габарит поперёк (корпус), м. */
  depth: number
  /** Этажность по умолчанию. */
  floors: number
  /** Высота этажа, м. */
  floorHeight: number
  /** Доля продаваемой площади от поэтажной (K1). */
  sellableRatio: number
  /** Степень огнестойкости / класс конструктивной пожарной опасности. */
  fireClass: FireClass
  /** Ёмкость: мест в ДОУ/школе или машино-мест. */
  capacity?: number
  color: string
}

export const TYPOLOGIES: Typology[] = [
  {
    id: 'sec-3x24',
    name: 'Секция 24×16, 9 эт.',
    kind: 'residential',
    width: 24,
    depth: 16,
    floors: 9,
    floorHeight: 3,
    sellableRatio: 0.72,
    fireClass: 'I-II-C0',
    color: '#8ea9c1',
  },
  {
    id: 'sec-long',
    name: 'Секция 36×16, 12 эт.',
    kind: 'residential',
    width: 36,
    depth: 16,
    floors: 12,
    floorHeight: 3,
    sellableRatio: 0.72,
    fireClass: 'I-II-C0',
    color: '#7d9bb5',
  },
  {
    id: 'tower',
    name: 'Башня 26×26, 17 эт.',
    kind: 'residential',
    width: 26,
    depth: 26,
    floors: 17,
    floorHeight: 3,
    sellableRatio: 0.7,
    fireClass: 'I-II-C0',
    color: '#6b8aa6',
  },
  {
    id: 'low-rise',
    name: 'Малоэтажный корпус 30×14, 4 эт.',
    kind: 'residential',
    width: 30,
    depth: 14,
    floors: 4,
    floorHeight: 3,
    sellableRatio: 0.74,
    fireClass: 'I-II-C0',
    color: '#9db6ca',
  },
  {
    id: 'kindergarten',
    name: 'Детский сад на 150 мест',
    kind: 'kindergarten',
    width: 60,
    depth: 30,
    floors: 2,
    floorHeight: 3.6,
    sellableRatio: 0,
    fireClass: 'I-II-C0',
    capacity: 150,
    color: '#d9b382',
  },
  {
    id: 'school',
    name: 'Школа на 600 мест',
    kind: 'school',
    width: 90,
    depth: 40,
    floors: 3,
    floorHeight: 3.6,
    sellableRatio: 0,
    fireClass: 'I-II-C0',
    capacity: 600,
    color: '#c99f6a',
  },
  {
    id: 'parking',
    name: 'Паркинг 60×32, 3 уровня',
    kind: 'parking',
    width: 60,
    depth: 32,
    floors: 3,
    floorHeight: 3,
    sellableRatio: 0,
    fireClass: 'I-II-C0',
    capacity: 200,
    color: '#b9b9b4',
  },
  {
    id: 'commercial',
    name: 'Коммерция 40×18, 2 эт.',
    kind: 'commercial',
    width: 40,
    depth: 18,
    floors: 2,
    floorHeight: 4,
    sellableRatio: 0.85,
    fireClass: 'I-II-C0',
    color: '#a8a49b',
  },
]

export const typologyById = (id: string): Typology => TYPOLOGIES.find((t) => t.id === id) ?? TYPOLOGIES[0]

/** Экземпляр здания на плане. */
export interface Building {
  id: string
  typologyId: string
  /** Центр здания, м. */
  x: number
  y: number
  /** Поворот против часовой стрелки, градусы. */
  rotation: number
  /** Этажность экземпляра (может отличаться от типовой). */
  floors: number
}

export const buildingHeight = (b: Building, t: Typology): number => b.floors * t.floorHeight
