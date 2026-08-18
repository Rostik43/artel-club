/** Точка в локальной метрической системе: x — восток, y — север, метры. */
export interface Pt {
  x: number
  y: number
}

/** Замкнутый контур без дублирования первой точки в конце. */
export type Ring = Pt[]

/** Полигон: внешний контур + вырезы. */
export interface Poly {
  outer: Ring
  holes: Ring[]
}

export interface Bbox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
