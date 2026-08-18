/**
 * Импорт контура участка.
 *
 * Поддержаны: кадастровый XML Росреестра (КПТ/выписка), GeoJSON, текстовый DXF
 * и ручной ввод координат. Все источники приводятся к локальной метрической
 * системе (x — восток, y — север) с началом в центре участка.
 */
import { cleanRing, ensureCcw, ringArea } from '../geo/polygon'
import type { Pt, Ring } from '../geo/types'

export interface ImportResult {
  ring: Ring
  cadastralNumber: string
  /** Исходная система координат, как её удалось определить. */
  source: string
  /** Все найденные контуры (первый — самый большой). */
  candidates: Ring[]
  warnings: string[]
}

/** Переносит контур так, чтобы его центр оказался в начале координат. */
export function recenter(ring: Ring): Ring {
  if (!ring.length) return ring
  const sum = ring.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  const cx = sum.x / ring.length
  const cy = sum.y / ring.length
  return ring.map((p) => ({ x: p.x - cx, y: p.y - cy }))
}

const byAreaDesc = (rings: Ring[]) => [...rings].sort((a, b) => ringArea(b) - ringArea(a))

const finish = (rings: Ring[], cadastralNumber: string, source: string, warnings: string[]): ImportResult => {
  const cleaned = rings.map((r) => cleanRing(r)).filter((r) => r.length >= 3)
  if (!cleaned.length) throw new Error('В файле не найдено ни одного замкнутого контура')
  const sorted = byAreaDesc(cleaned)
  return {
    ring: ensureCcw(recenter(sorted[0])),
    candidates: sorted.map((r) => ensureCcw(recenter(r))),
    cadastralNumber,
    source,
    warnings,
  }
}

/* ------------------------------- XML Росреестра ------------------------------ */

const attr = (el: Element, ...names: string[]): string | null => {
  for (const name of names) {
    for (const a of Array.from(el.attributes)) {
      if (a.name.toLowerCase() === name.toLowerCase()) return a.value
    }
  }
  return null
}

const childText = (el: Element, name: string): string | null => {
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase().endsWith(name.toLowerCase())) return child.textContent
  }
  return null
}

export function parseRosreestrXml(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Файл не разобрался как XML')

  const warnings: string[] = []
  const all = Array.from(doc.getElementsByTagName('*'))

  // Номер лежит либо в атрибуте (старые XSD), либо в теге cad_number/cadastral_number.
  const isCadastralTag = (tag: string) => /cad(astral)?_?number/i.test(tag)
  const cadastralNumber =
    all
      .map((el) => attr(el, 'CadastralNumber', 'cad_number') ?? (isCadastralTag(el.tagName) ? el.textContent : null))
      .find((v) => v && /\d+:\d+:\d+/.test(v))
      ?.trim() ?? ''

  // Ordinate-элементы группируются по ближайшему родителю-контуру.
  const groups = new Map<Element, Pt[]>()
  for (const el of all) {
    if (!el.tagName.toLowerCase().endsWith('ordinate')) continue
    const xRaw = attr(el, 'X', 'x') ?? childText(el, 'x')
    const yRaw = attr(el, 'Y', 'y') ?? childText(el, 'y')
    if (xRaw === null || yRaw === null) continue
    const north = Number(String(xRaw).replace(',', '.'))
    const east = Number(String(yRaw).replace(',', '.'))
    if (!Number.isFinite(north) || !Number.isFinite(east)) continue
    const parent = el.parentElement?.parentElement ?? el.parentElement ?? doc.documentElement
    const list = groups.get(parent) ?? []
    // В МСК X — север, Y — восток; в локальной системе оси меняются местами.
    list.push({ x: east, y: north })
    groups.set(parent, list)
  }

  const rings = [...groups.values()].filter((r) => r.length >= 3)
  if (!rings.length) throw new Error('В XML не найдено элементов <Ordinate> с координатами')
  if (rings.length > 1) warnings.push(`Найдено контуров: ${rings.length}. Взят самый большой, остальные доступны для выбора.`)

  return finish(rings, cadastralNumber, 'Кадастровый XML (МСК, метры)', warnings)
}

/* ---------------------------------- GeoJSON --------------------------------- */

interface GeoJsonLike {
  type?: string
  features?: GeoJsonLike[]
  geometry?: GeoJsonLike
  properties?: Record<string, unknown>
  coordinates?: unknown
}

/** Локальная равнопромежуточная проекция вокруг опорной точки. */
export function projectWgs84(lonLat: [number, number], origin: [number, number]): Pt {
  const R = 6378137
  const [lon, lat] = lonLat
  const [lon0, lat0] = origin
  const rad = Math.PI / 180
  return {
    x: (lon - lon0) * rad * R * Math.cos(lat0 * rad),
    y: (lat - lat0) * rad * R,
  }
}

export function parseGeoJson(text: string): ImportResult {
  const data = JSON.parse(text) as GeoJsonLike
  const warnings: string[] = []
  const polygons: [number, number][][] = []
  let cadastralNumber = ''

  const collect = (node: GeoJsonLike | undefined) => {
    if (!node) return
    if (node.type === 'FeatureCollection') {
      node.features?.forEach(collect)
      return
    }
    if (node.type === 'Feature') {
      const props = node.properties ?? {}
      for (const [key, value] of Object.entries(props)) {
        if (/cad|кадастр/i.test(key) && typeof value === 'string' && /\d+:\d+:\d+/.test(value)) cadastralNumber = value
      }
      collect(node.geometry)
      return
    }
    if (node.type === 'Polygon') {
      const coords = node.coordinates as [number, number][][]
      if (coords?.[0]) polygons.push(coords[0])
      return
    }
    if (node.type === 'MultiPolygon') {
      const coords = node.coordinates as [number, number][][][]
      coords?.forEach((poly) => poly[0] && polygons.push(poly[0]))
    }
  }
  collect(data)

  if (!polygons.length) throw new Error('В GeoJSON не найдено полигонов')

  const first = polygons[0][0]
  const looksGeographic = Math.abs(first[0]) <= 180 && Math.abs(first[1]) <= 90
  const origin = first
  const rings: Ring[] = polygons.map((coords) =>
    coords.map(([a, b]) => (looksGeographic ? projectWgs84([a, b], origin) : { x: a, y: b })),
  )
  if (!looksGeographic) warnings.push('Координаты приняты как метрические (проекция не WGS84).')

  return finish(rings, cadastralNumber, looksGeographic ? 'GeoJSON (WGS84 → локальные метры)' : 'GeoJSON (метры)', warnings)
}

/* ------------------------------------ DXF ----------------------------------- */

export function parseDxf(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const rings: Ring[] = []
  let current: Ring | null = null
  let pendingX: number | null = null
  let inVertex = false

  const flush = () => {
    if (current && current.length >= 3) rings.push(current)
    current = null
  }

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i]
    const value = lines[i + 1]
    if (code === '0') {
      const entity = value.toUpperCase()
      if (entity === 'LWPOLYLINE' || entity === 'POLYLINE') {
        flush()
        current = []
        inVertex = entity === 'LWPOLYLINE'
      } else if (entity === 'VERTEX') {
        inVertex = true
      } else if (entity === 'SEQEND' || entity === 'ENDSEC') {
        flush()
        inVertex = false
      } else if (current) {
        flush()
        inVertex = false
      }
      pendingX = null
      continue
    }
    if (!current || !inVertex) continue
    if (code === '10') {
      pendingX = Number(value)
    } else if (code === '20' && pendingX !== null) {
      const y = Number(value)
      if (Number.isFinite(pendingX) && Number.isFinite(y)) current.push({ x: pendingX, y })
      pendingX = null
    }
  }
  flush()

  if (!rings.length) throw new Error('В DXF не найдено полилиний (LWPOLYLINE/POLYLINE)')
  return finish(rings, '', 'DXF (единицы приняты за метры)', [
    'Единицы DXF приняты за метры — проверьте площадь участка после импорта.',
  ])
}

/* ------------------------------- Текст координат ----------------------------- */

export function parseCoordinateText(text: string, swapAxes = false): ImportResult {
  const ring: Ring = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const numbers = line.match(/-?\d+(?:[.,]\d+)?/g)
    if (!numbers || numbers.length < 2) continue
    const values = numbers.map((n) => Number(n.replace(',', '.')))
    // Если чисел три и больше — первое считаем номером точки.
    const [a, b] = values.length >= 3 ? values.slice(1) : values
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    ring.push(swapAxes ? { x: b, y: a } : { x: a, y: b })
  }
  if (ring.length < 3) throw new Error('Нужно минимум три точки: по одной строке на точку, «X Y» или «№ X Y»')
  return finish([ring], '', swapAxes ? 'Ручной ввод (X — север, Y — восток)' : 'Ручной ввод (метры)', [])
}

/* -------------------------------- Диспетчер --------------------------------- */

export function importByFilename(name: string, text: string): ImportResult {
  const lower = name.toLowerCase()
  if (lower.endsWith('.xml')) return parseRosreestrXml(text)
  if (lower.endsWith('.json') || lower.endsWith('.geojson')) return parseGeoJson(text)
  if (lower.endsWith('.dxf')) return parseDxf(text)
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCoordinateText(text)
  // Пробуем угадать по содержимому.
  const head = text.slice(0, 400).trim()
  if (head.startsWith('<')) return parseRosreestrXml(text)
  if (head.startsWith('{')) return parseGeoJson(text)
  if (/^\s*0\s*[\r\n]+\s*SECTION/i.test(text)) return parseDxf(text)
  return parseCoordinateText(text)
}
