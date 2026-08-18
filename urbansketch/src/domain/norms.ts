/**
 * Нормативный набор (МНГП/СП) — параметры, от которых считается баланс территории.
 * Значения — редактируемые пресеты для быстрого старта, а не выписка из документа:
 * перед выдачей результата заказчику их сверяют с действующими МНГП конкретного города.
 */
export interface NormSet {
  id: string
  name: string
  /** Комментарий-источник, отображается в интерфейсе. */
  source: string
  /** Широта города — нужна для расчёта инсоляции. */
  latitude: number
  /** Максимальная плотность жилой застройки, м² общей площади квартир на га территории. */
  maxDensity: number
  /** Максимальный процент застройки территории, %. */
  maxBuiltUpPercent: number
  /** Максимальная этажность. */
  maxFloors: number
  /** Жилищная обеспеченность, м² общей площади квартир на человека. */
  areaPerResident: number
  /** Мест в дошкольных учреждениях на 1000 жителей. */
  kindergartenPer1000: number
  /** Мест в школах на 1000 жителей. */
  schoolPer1000: number
  /** Машино-мест на 1000 жителей. */
  parkingPer1000: number
  /** Озеленение придомовой территории, м² на человека. */
  greenPerResident: number
  /** Площадки для игр, отдыха и спорта, м² на человека. */
  playgroundPerResident: number
  /** Минимальный отступ застройки от границы участка, м. */
  minSetback: number
  /** Требуемая непрерывная продолжительность инсоляции на 22 марта, ч. */
  insolationHours: number
}

export const NORM_SETS: NormSet[] = [
  {
    id: 'ru-default',
    name: 'СП 42.13330 (базовый)',
    source: 'Обобщённые значения СП 42.13330.2016 и СП 476.1325800.2020',
    latitude: 55.75,
    maxDensity: 15000,
    maxBuiltUpPercent: 40,
    maxFloors: 25,
    areaPerResident: 30,
    kindergartenPer1000: 50,
    schoolPer1000: 115,
    parkingPer1000: 350,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2,
  },
  {
    id: 'msk',
    name: 'Москва',
    source: 'Пресет по РНГП г. Москвы, требует сверки перед выдачей',
    latitude: 55.75,
    maxDensity: 25000,
    maxBuiltUpPercent: 45,
    maxFloors: 25,
    areaPerResident: 30,
    kindergartenPer1000: 36,
    schoolPer1000: 91,
    parkingPer1000: 420,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2,
  },
  {
    id: 'spb',
    name: 'Санкт-Петербург',
    source: 'Пресет по РНГП Санкт-Петербурга, требует сверки перед выдачей',
    latitude: 59.94,
    maxDensity: 21000,
    maxBuiltUpPercent: 40,
    maxFloors: 12,
    areaPerResident: 28,
    kindergartenPer1000: 61,
    schoolPer1000: 120,
    parkingPer1000: 400,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2.5,
  },
  {
    id: 'ekb',
    name: 'Екатеринбург',
    source: 'Пресет по МНГП Екатеринбурга, требует сверки перед выдачей',
    latitude: 56.84,
    maxDensity: 18000,
    maxBuiltUpPercent: 40,
    maxFloors: 25,
    areaPerResident: 30,
    kindergartenPer1000: 55,
    schoolPer1000: 114,
    parkingPer1000: 380,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2,
  },
  {
    id: 'kzn',
    name: 'Казань',
    source: 'Пресет по МНГП Казани, требует сверки перед выдачей',
    latitude: 55.79,
    maxDensity: 17000,
    maxBuiltUpPercent: 40,
    maxFloors: 20,
    areaPerResident: 30,
    kindergartenPer1000: 55,
    schoolPer1000: 110,
    parkingPer1000: 350,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2,
  },
  {
    id: 'nsk',
    name: 'Новосибирск',
    source: 'Пресет по МНГП Новосибирска, требует сверки перед выдачей',
    latitude: 55.03,
    maxDensity: 16000,
    maxBuiltUpPercent: 40,
    maxFloors: 25,
    areaPerResident: 30,
    kindergartenPer1000: 60,
    schoolPer1000: 115,
    parkingPer1000: 330,
    greenPerResident: 6,
    playgroundPerResident: 2.4,
    minSetback: 3,
    insolationHours: 2,
  },
]

export const normSetById = (id: string): NormSet => NORM_SETS.find((n) => n.id === id) ?? NORM_SETS[0]

/**
 * Противопожарные разрывы между жилыми зданиями, м (СП 4.13130.2013, таблица 1, упрощённо).
 * Ключ — пара степеней огнестойкости/класса конструктивной пожарной опасности.
 */
export type FireClass = 'I-II-C0' | 'III-C1' | 'IV-V-C2'

const FIRE_GAP: Record<FireClass, Record<FireClass, number>> = {
  'I-II-C0': { 'I-II-C0': 6, 'III-C1': 8, 'IV-V-C2': 10 },
  'III-C1': { 'I-II-C0': 8, 'III-C1': 8, 'IV-V-C2': 10 },
  'IV-V-C2': { 'I-II-C0': 10, 'III-C1': 10, 'IV-V-C2': 15 },
}

export const fireGap = (a: FireClass, b: FireClass): number => FIRE_GAP[a][b]

/**
 * Бытовой (санитарный) разрыв между длинными сторонами жилых зданий, м
 * (СП 42.13330.2016, п. 7.1): 2–3 этажа — 15 м, 4 этажа и выше — 20 м.
 */
export const domesticGap = (floorsA: number, floorsB: number): number => {
  const maxFloors = Math.max(floorsA, floorsB)
  if (maxFloors >= 4) return 20
  if (maxFloors >= 2) return 15
  return 10
}

/** Разрыв между длинными сторонами и торцами с окнами жилых комнат, м. */
export const endWallGap = 10
