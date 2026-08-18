import { bboxOf } from '../geo/polygon'
import type { Poly, Ring } from '../geo/types'
import { buildingRing } from '../domain/checks'
import type { Project } from '../domain/project'
import type { Tep } from '../domain/tep'
import { typologyById } from '../domain/typologies'
import type { NormSet } from '../domain/norms'

const num = (v: number, digits = 0) => v.toLocaleString('ru-RU', { maximumFractionDigits: digits })

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** Имя файла латиницей: часть браузеров теряет кириллицу в атрибуте download. */
export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

interface HostDownloads {
  save: (request: { filename: string; data: string }) => Promise<unknown>
}

interface HostBridge {
  use?: (name: string) => Promise<unknown>
}

/** Расширения, которые принимает просмотрщик артефактов без дополнительных прав. */
const SAFE_EXTENSIONS = new Set(['txt', 'json', 'md', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'])

/** Запасное имя, если хост не принимает исходное расширение. */
function fallbackFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return filename.endsWith('.geojson') ? `${base}.json` : `${base}.txt`
}

function anchorDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Сохранение через хост-страницу (опубликованный артефакт): обычная ссылка
 * с атрибутом download там заблокирована.
 */
async function hostDownload(bridge: HostBridge, filename: string, content: string): Promise<boolean> {
  const downloads = (await bridge.use?.('downloads').catch(() => null)) as HostDownloads | null
  if (!downloads) return false
  const extension = filename.split('.').pop() ?? ''
  const names = SAFE_EXTENSIONS.has(extension) ? [filename] : [filename, fallbackFilename(filename)]
  for (const name of names) {
    try {
      await downloads.save({ filename: name, data: content })
      return true
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      // Отказ пользователя — это нормальный исход, повторять не нужно.
      if (code === 'declined') return true
      if (code !== 'rejected_extension' && code !== 'extension_not_enabled') return false
    }
  }
  return false
}

export function download(filename: string, content: string, mime: string) {
  const bridge = (window as unknown as { claude?: HostBridge }).claude
  if (bridge?.use) {
    void hostDownload(bridge, filename, content).then((saved) => {
      if (!saved) anchorDownload(filename, content, mime)
    })
    return
  }
  anchorDownload(filename, content, mime)
}

export const projectToJson = (project: Project): string => JSON.stringify(project, null, 2)

export function projectFromJson(text: string): Project {
  const data = JSON.parse(text) as Project
  if (!Array.isArray(data.parcel)) throw new Error('В файле нет контура участка')
  return data
}

/** ТЭП в CSV для выгрузки в Excel (разделитель — точка с запятой). */
export function tepToCsv(project: Project, tep: Tep, norms: NormSet): string {
  const rows: [string, string | number][] = [
    ['Проект', project.name],
    ['Кадастровый номер', project.cadastralNumber || '—'],
    ['Нормативный набор', norms.name],
    ['Площадь участка, м²', num(tep.parcelArea)],
    ['Площадь участка, га', num(tep.parcelHa, 3)],
    ['Площадь пятна застройки, м²', num(tep.buildableArea)],
    ['Площадь застройки, м²', num(tep.footprintArea)],
    ['Процент застройки, %', num(tep.builtUpPercent, 1)],
    ['Поэтажная площадь, м²', num(tep.grossFloorArea)],
    ['в т.ч. жилая, м²', num(tep.residentialGfa)],
    ['Общая площадь квартир, м²', num(tep.sellableArea)],
    ['Коммерческая площадь, м²', num(tep.commercialArea)],
    ['Плотность, м²/га', num(tep.density)],
    ['Норма плотности, м²/га', num(norms.maxDensity)],
    ['Средняя этажность', num(tep.averageFloors, 1)],
    ['Максимальная этажность', num(tep.maxFloors)],
    ['Расчётное население, чел.', num(tep.residents)],
    ['Потребность в местах ДОУ', num(tep.demand.kindergartenSeats)],
    ['Размещено мест ДОУ', num(tep.provided.kindergartenSeats)],
    ['Потребность в местах школ', num(tep.demand.schoolSeats)],
    ['Размещено мест школ', num(tep.provided.schoolSeats)],
    ['Потребность в машино-местах', num(tep.demand.parkingSpaces)],
    ['Машино-мест в паркингах', num(tep.provided.parkingSpaces)],
    ['Требуемое озеленение, м²', num(tep.demand.greenArea)],
    ['Требуемые площадки, м²', num(tep.demand.playgroundArea)],
    ['Свободная территория, м²', num(tep.balance.free)],
  ]

  const head = 'Показатель;Значение'
  const body = rows.map(([k, v]) => `${k};${v}`).join('\n')
  const buildingsHead = '\n\nКорпус;Тип;Этажей;Пятно, м²;Поэтажная, м²;Продаваемая, м²'
  const buildings = tep.perBuilding
    .map(
      (m, i) =>
        `${i + 1};${m.typology.name};${m.building.floors};${num(m.footprint)};${num(m.grossFloorArea)};${num(
          m.sellableArea,
        )}`,
    )
    .join('\n')

  return `﻿${head}\n${body}${buildingsHead}\n${buildings}\n`
}

const ringPath = (ring: Ring) => `${ring.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(' ')} Z`

const polyPath = (poly: Poly) => [poly.outer, ...poly.holes].map(ringPath).join(' ')

/** Схема планировочной организации в SVG (масштабируемая, для вставки в отчёт). */
export function planToSvg(project: Project, buildable: Poly[], tep: Tep, norms: NormSet): string {
  const rings = [project.parcel, ...project.buildings.map(buildingRing)]
  const box = bboxOf(rings.filter((r) => r.length))
  const pad = 30
  const width = box.maxX - box.minX + pad * 2
  const height = box.maxY - box.minY + pad * 2
  const viewBox = `${box.minX - pad} ${-box.maxY - pad} ${width} ${height}`

  const buildings = project.buildings
    .map((b) => {
      const t = typologyById(b.typologyId)
      const ring = buildingRing(b)
      return `<path d="${ringPath(ring)}" fill="${t.color}" stroke="#1f2937" stroke-width="0.4"/>
    <text x="${b.x.toFixed(2)}" y="${(-b.y).toFixed(2)}" font-size="4" text-anchor="middle" fill="#0f172a">${b.floors} эт.</text>`
    })
    .join('\n    ')

  const scaleBarLength = 50
  const legend = [
    project.cadastralNumber && project.cadastralNumber !== project.name
      ? `${project.name} · ${project.cadastralNumber}`
      : project.name,
    `Участок ${num(tep.parcelArea)} м² · застройка ${num(tep.builtUpPercent, 1)} %`,
    `Общая площадь квартир ${num(tep.sellableArea)} м² · плотность ${num(tep.density)} м²/га (норма ${num(norms.maxDensity)})`,
    `Население ${num(tep.residents)} чел. · корпусов ${project.buildings.length}`,
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Math.round(width * 3)}" height="${Math.round(
    height * 3,
  )}" font-family="Inter, Arial, sans-serif">
  <rect x="${box.minX - pad}" y="${-box.maxY - pad}" width="${width}" height="${height}" fill="#ffffff"/>
  <g>
    ${buildable.map((p) => `<path d="${polyPath(p)}" fill="#eef2f6" stroke="#94a3b8" stroke-width="0.3" stroke-dasharray="2 1.5"/>`).join('\n    ')}
    <path d="${ringPath(project.parcel)}" fill="none" stroke="#111827" stroke-width="0.7"/>
    ${buildings}
  </g>
  <g transform="translate(${box.minX} ${-box.minY + 12})">
    <line x1="0" y1="0" x2="${scaleBarLength}" y2="0" stroke="#111827" stroke-width="0.6"/>
    <line x1="0" y1="-2" x2="0" y2="2" stroke="#111827" stroke-width="0.6"/>
    <line x1="${scaleBarLength}" y1="-2" x2="${scaleBarLength}" y2="2" stroke="#111827" stroke-width="0.6"/>
    <text x="${scaleBarLength / 2}" y="6" font-size="4" text-anchor="middle" fill="#111827">${scaleBarLength} м</text>
  </g>
  <g transform="translate(${box.minX} ${-box.maxY - pad + 8})">
    ${legend.map((line, i) => `<text x="0" y="${i * 6}" font-size="5" fill="#0f172a">${escapeXml(line)}</text>`).join('\n    ')}
  </g>
</svg>`
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string)

/** Контур участка и посадка в GeoJSON — для передачи в ГИС/САПР. */
export function projectToGeoJson(project: Project): string {
  const feature = (ring: Ring, properties: Record<string, unknown>) => ({
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [[...ring, ring[0]].map((p) => [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))])],
    },
  })

  const features = [
    feature(project.parcel, { role: 'parcel', name: project.name, cadastral: project.cadastralNumber }),
    ...project.buildings.map((b) => {
      const t = typologyById(b.typologyId)
      return feature(buildingRing(b), {
        role: 'building',
        typology: t.name,
        kind: t.kind,
        floors: b.floors,
        height: b.floors * t.floorHeight,
      })
    }),
  ]

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
}
