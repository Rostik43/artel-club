import { useRef } from 'react'
import { useStore } from '../app/store'
import type { Poly } from '../geo/types'
import type { NormSet } from '../domain/norms'
import type { Tep } from '../domain/tep'
import { download, fileSlug, planToSvg, projectFromJson, projectToGeoJson, projectToJson, tepToCsv } from '../io/export'
import { Section } from './primitives'

export function ExportPanel({ tep, norms, buildable }: { tep: Tep; norms: NormSet; buildable: Poly[] }) {
  const { state, dispatch } = useStore()
  const { project } = state
  const fileRef = useRef<HTMLInputElement>(null)
  const slug = fileSlug(project.cadastralNumber || project.name)

  return (
    <Section title="Экспорт и проект" defaultOpen={false}>
      <div className="btn-group">
        <button
          className="btn sm"
          disabled={!project.parcel.length}
          onClick={() => download(`${slug}-plan.svg`, planToSvg(project, buildable, tep, norms), 'image/svg+xml')}
        >
          Схема SVG
        </button>
        <button
          className="btn sm"
          disabled={!project.parcel.length}
          onClick={() => download(`${slug}-tep.csv`, tepToCsv(project, tep, norms), 'text/csv')}
        >
          ТЭП CSV
        </button>
      </div>
      <div className="btn-group">
        <button
          className="btn sm"
          disabled={!project.parcel.length}
          onClick={() => download(`${slug}.geojson`, projectToGeoJson(project), 'application/geo+json')}
        >
          GeoJSON
        </button>
        <button className="btn sm" onClick={() => download(`${slug}.json`, projectToJson(project), 'application/json')}>
          Проект JSON
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            dispatch({ type: 'loadProject', project: projectFromJson(await file.text()) })
            dispatch({ type: 'setNotice', notice: { kind: 'info', text: 'Проект загружен' } })
          } catch (error) {
            dispatch({ type: 'setNotice', notice: { kind: 'error', text: (error as Error).message } })
          }
        }}
      />
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        Открыть проект из JSON
      </button>
      <p className="hint">
        SVG открывается в CAD и вставляется в презентацию, CSV — в Excel, GeoJSON — в ГИС и Revit/ArchiCAD через
        конвертер.
      </p>
    </Section>
  )
}
