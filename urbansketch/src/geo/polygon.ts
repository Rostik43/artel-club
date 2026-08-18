import ClipperLib from 'clipper-lib'
import type { Bbox, Poly, Pt, Ring } from './types'

/** Clipper работает с целыми числами — храним метры с точностью до 1 мм. */
const SCALE = 1000

const toClipper = (ring: Ring) => ring.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))
const fromClipper = (path: { X: number; Y: number }[]): Ring => path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }))

export const ringToPoly = (outer: Ring): Poly => ({ outer, holes: [] })

/** Площадь контура по формуле шнурования, всегда положительная. */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export const polyArea = (poly: Poly): number =>
  ringArea(poly.outer) - poly.holes.reduce((acc, h) => acc + ringArea(h), 0)

export const polysArea = (polys: Poly[]): number => polys.reduce((acc, p) => acc + polyArea(p), 0)

/** Периметр контура. */
export function ringPerimeter(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    sum += dist(ring[i], ring[(i + 1) % ring.length])
  }
  return sum
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function bboxOf(rings: Ring[]): Bbox {
  const box: Bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < box.minX) box.minX = p.x
      if (p.y < box.minY) box.minY = p.y
      if (p.x > box.maxX) box.maxX = p.x
      if (p.y > box.maxY) box.maxY = p.y
    }
  }
  return box
}

export function centroid(ring: Ring): Pt {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    const cross = p.x * q.y - q.x * p.y
    a += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (Math.abs(a) < 1e-9) {
    const box = bboxOf([ring])
    return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  }
  a *= 0.5
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pointInRing(p: Pt, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export const pointInPoly = (p: Pt, poly: Poly): boolean =>
  pointInRing(p, poly.outer) && !poly.holes.some((h) => pointInRing(p, h))

export const pointInAny = (p: Pt, polys: Poly[]): boolean => polys.some((poly) => pointInPoly(p, poly))

/** Кратчайшее расстояние от точки до отрезка. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y))
  const o1 = o(a, b, c)
  const o2 = o(a, b, d)
  const o3 = o(c, d, a)
  const o4 = o(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  const onSeg = (p: Pt, q: Pt, r: Pt) =>
    Math.min(p.x, r.x) - 1e-9 <= q.x &&
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    Math.min(p.y, r.y) - 1e-9 <= q.y &&
    q.y <= Math.max(p.y, r.y) + 1e-9
  if (o1 === 0 && onSeg(a, c, b)) return true
  if (o2 === 0 && onSeg(a, d, b)) return true
  if (o3 === 0 && onSeg(c, a, d)) return true
  if (o4 === 0 && onSeg(c, b, d)) return true
  return false
}

/** Расстояние между двумя выпуклыми/невыпуклыми контурами: 0 при пересечении. */
export function ringDistance(a: Ring, b: Ring): number {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return 0
    }
  }
  if (pointInRing(a[0], b) || pointInRing(b[0], a)) return 0
  let min = Infinity
  for (const p of a) {
    for (let j = 0; j < b.length; j++) {
      min = Math.min(min, distToSegment(p, b[j], b[(j + 1) % b.length]))
    }
  }
  for (const p of b) {
    for (let i = 0; i < a.length; i++) {
      min = Math.min(min, distToSegment(p, a[i], a[(i + 1) % a.length]))
    }
  }
  return min
}

/** Смещение полигона внутрь (delta < 0) или наружу (delta > 0). Возвращает список полигонов. */
export function offsetPoly(poly: Poly, delta: number): Poly[] {
  const co = new ClipperLib.ClipperOffset(2, 0.25 * SCALE)
  co.AddPath(toClipper(poly.outer), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  for (const hole of poly.holes) {
    co.AddPath(toClipper(hole).reverse(), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  }
  const solution: { X: number; Y: number }[][] = []
  co.Execute(solution, delta * SCALE)
  return pathsToPolys(solution)
}

export const offsetPolys = (polys: Poly[], delta: number): Poly[] => polys.flatMap((p) => offsetPoly(p, delta))

function boolOp(subject: Poly[], clip: Poly[], type: number): Poly[] {
  const clipper = new ClipperLib.Clipper()
  for (const poly of subject) {
    clipper.AddPath(toClipper(poly.outer), ClipperLib.PolyType.ptSubject, true)
    for (const hole of poly.holes) clipper.AddPath(toClipper(hole).reverse(), ClipperLib.PolyType.ptSubject, true)
  }
  for (const poly of clip) {
    clipper.AddPath(toClipper(poly.outer), ClipperLib.PolyType.ptClip, true)
    for (const hole of poly.holes) clipper.AddPath(toClipper(hole).reverse(), ClipperLib.PolyType.ptClip, true)
  }
  const solution: { X: number; Y: number }[][] = []
  clipper.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return pathsToPolys(solution)
}

export const unionPolys = (polys: Poly[]): Poly[] => (polys.length ? boolOp(polys, [], ClipperLib.ClipType.ctUnion) : [])
export const intersectPolys = (a: Poly[], b: Poly[]): Poly[] => boolOp(a, b, ClipperLib.ClipType.ctIntersection)
export const differencePolys = (a: Poly[], b: Poly[]): Poly[] => boolOp(a, b, ClipperLib.ClipType.ctDifference)

/** Собирает плоский список путей Clipper в полигоны с дырами по ориентации. */
function pathsToPolys(paths: { X: number; Y: number }[][]): Poly[] {
  const outers: Poly[] = []
  const holes: Ring[] = []
  for (const path of paths) {
    if (path.length < 3) continue
    const ring = fromClipper(path)
    if (ClipperLib.Clipper.Orientation(path)) outers.push({ outer: ring, holes: [] })
    else holes.push(ring)
  }
  for (const hole of holes) {
    const host = outers.find((poly) => pointInRing(hole[0], poly.outer))
    if (host) host.holes.push(hole)
  }
  return outers
}

/** Полностью ли контур `inner` лежит внутри набора полигонов. */
export function ringInsidePolys(inner: Ring, polys: Poly[]): boolean {
  if (!polys.length) return false
  const remainder = differencePolys([ringToPoly(inner)], polys)
  // допускаем погрешность клиппера в 0.01 м²
  return polysArea(remainder) < 0.01
}

export const rotatePt = (p: Pt, angleDeg: number, origin: Pt = { x: 0, y: 0 }): Pt => {
  const a = (angleDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/** Прямоугольник по центру, размерам и повороту (против часовой, градусы). */
export function rectRing(center: Pt, width: number, depth: number, rotationDeg: number): Ring {
  const hw = width / 2
  const hd = depth / 2
  const corners: Ring = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  return corners.map((c) => {
    const r = rotatePt(c, rotationDeg)
    return { x: center.x + r.x, y: center.y + r.y }
  })
}

/** Углы сторон контура в градусах (0..180), отсортированные по суммарной длине. */
export function dominantAngles(ring: Ring): number[] {
  const buckets = new Map<number, number>()
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const len = dist(a, b)
    if (len < 1) continue
    let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    deg = ((deg % 180) + 180) % 180
    const key = Math.round(deg)
    buckets.set(key, (buckets.get(key) ?? 0) + len)
  }
  return [...buckets.entries()].sort((x, y) => y[1] - x[1]).map(([deg]) => deg)
}

export function ensureCcw(ring: Ring): Ring {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += (b.x - a.x) * (b.y + a.y)
  }
  return sum > 0 ? [...ring].reverse() : ring
}

/** Убирает дубли и почти-коллинеарные точки. */
export function cleanRing(ring: Ring, tolerance = 0.05): Ring {
  const out: Ring = []
  for (const p of ring) {
    const prev = out[out.length - 1]
    if (!prev || dist(prev, p) > tolerance) out.push(p)
  }
  while (out.length > 2 && dist(out[0], out[out.length - 1]) <= tolerance) out.pop()
  return out
}
