import { useRef, useState } from 'react'
import { useStore } from '../app/store'
import { NORM_SETS, normSetById } from '../domain/norms'
import { importByFilename, parseCoordinateText, type ImportResult } from '../io/import'
import { ringArea } from '../geo/polygon'
import { Checkbox, Field, NumberField, Section, fmt } from './primitives'
import { SAMPLE_PARCELS } from '../samples'

export function SitePanel() {
  const { state, dispatch } = useStore()
  const { project } = state
  const norms = normSetById(project.normSetId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [manual, setManual] = useState('')
  const [swapAxes, setSwapAxes] = useState(false)
  const [lastImport, setLastImport] = useState<ImportResult | null>(null)

  const applyImport = (result: ImportResult, name: string) => {
    setLastImport(result)
    dispatch({
      type: 'setParcel',
      ring: result.ring,
      cadastralNumber: result.cadastralNumber,
      name: result.cadastralNumber || name,
    })
    const area = ringArea(result.ring)
    dispatch({
      type: 'setNotice',
      notice: {
        kind: 'info',
        text: `Импортирован контур: ${fmt(area)} м² (${result.source})`,
      },
    })
  }

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      applyImport(importByFilename(file.name, text), file.name.replace(/\.[^.]+$/, ''))
    } catch (error) {
      dispatch({ type: 'setNotice', notice: { kind: 'error', text: (error as Error).message } })
    }
  }

  return (
    <>
      <Section title="Участок">
        <Field label="Название">
          <input
            type="text"
            value={project.name}
            onChange={(e) => dispatch({ type: 'patchProject', patch: { name: e.target.value }, history: false })}
          />
        </Field>
        <Field label="Кадастровый номер">
          <input
            type="text"
            placeholder="00:00:0000000:000"
            value={project.cadastralNumber}
            onChange={(e) =>
              dispatch({ type: 'patchProject', patch: { cadastralNumber: e.target.value }, history: false })
            }
          />
        </Field>
        <div className="stats">
          <div className="stat">
            <span className="label">Площадь по контуру</span>
            <span className="value">{fmt(ringArea(project.parcel))} м²</span>
          </div>
          <div className="stat">
            <span className="label">То же в гектарах</span>
            <span className="value">{fmt(ringArea(project.parcel) / 10000, 3)} га</span>
          </div>
          <div className="stat">
            <span className="label">Вершин контура</span>
            <span className="value">{project.parcel.length}</span>
          </div>
        </div>
        {lastImport && lastImport.candidates.length > 1 && (
          <Field label={`Контуров в файле: ${lastImport.candidates.length}`}>
            <select
              onChange={(e) => {
                const ring = lastImport.candidates[Number(e.target.value)]
                if (ring) dispatch({ type: 'setParcel', ring })
              }}
            >
              {lastImport.candidates.map((ring, i) => (
                <option key={i} value={i}>
                  Контур {i + 1} — {fmt(ringArea(ring))} м²
                </option>
              ))}
            </select>
          </Field>
        )}
        {lastImport?.warnings.map((w) => (
          <p key={w} className="hint">
            {w}
          </p>
        ))}
      </Section>

      <Section title="Импорт границ">
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.json,.geojson,.dxf,.csv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onFile(file)
            e.target.value = ''
          }}
        />
        <button className="btn primary block" onClick={() => fileRef.current?.click()}>
          Загрузить файл
        </button>
        <p className="hint">
          Кадастровый XML Росреестра (КПТ и выписки), GeoJSON, DXF с полилиниями, текстовый список координат.
        </p>
        <Field label="Ввод координат вручную">
          <textarea
            placeholder={'1 12345.67 23456.78\n2 12401.10 23470.55\n…'}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
        </Field>
        <Checkbox label="Первый столбец — X (север), как в МСК" checked={swapAxes} onChange={setSwapAxes} />
        <button
          className="btn block"
          disabled={!manual.trim()}
          onClick={() => {
            try {
              applyImport(parseCoordinateText(manual, swapAxes), 'Участок по координатам')
            } catch (error) {
              dispatch({ type: 'setNotice', notice: { kind: 'error', text: (error as Error).message } })
            }
          }}
        >
          Построить контур
        </button>
        <Field label="Демонстрационные участки">
          <select
            defaultValue=""
            onChange={(e) => {
              const sample = SAMPLE_PARCELS.find((s) => s.id === e.target.value)
              if (!sample) return
              dispatch({ type: 'setParcel', ring: sample.ring, name: sample.name, cadastralNumber: '' })
            }}
          >
            <option value="">— выбрать —</option>
            {SAMPLE_PARCELS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {fmt(ringArea(s.ring) / 10000, 2)} га
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Градостроительные условия">
        <Field label="Нормативный набор (МНГП)">
          <select
            value={project.normSetId}
            onChange={(e) => {
              const next = normSetById(e.target.value)
              dispatch({
                type: 'patchProject',
                patch: { normSetId: next.id, latitude: next.latitude },
              })
            }}
          >
            {NORM_SETS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="hint">{norms.source}</p>
        <div className="grid-2">
          <NumberField
            label="Отступ от границ"
            suffix="м"
            value={project.setback}
            min={0}
            step={0.5}
            onChange={(setback) => dispatch({ type: 'patchProject', patch: { setback } })}
          />
          <NumberField
            label="Отступ от красных линий"
            suffix="м"
            value={project.redLineSetback}
            min={0}
            step={0.5}
            onChange={(redLineSetback) => dispatch({ type: 'patchProject', patch: { redLineSetback } })}
          />
        </div>
        <Field label="Стороны участка вдоль красных линий">
          <div className="row wrap">
            {project.parcel.map((_, i) => {
              const active = project.redLineEdges.includes(i)
              return (
                <button
                  key={i}
                  className={`btn sm${active ? ' active' : ''}`}
                  onClick={() =>
                    dispatch({
                      type: 'patchProject',
                      patch: {
                        redLineEdges: active
                          ? project.redLineEdges.filter((e) => e !== i)
                          : [...project.redLineEdges, i],
                      },
                    })
                  }
                >
                  {i + 1}
                </button>
              )
            })}
            {!project.parcel.length && <span className="hint">Сначала задайте контур</span>}
          </div>
        </Field>
        <NumberField
          label="Широта участка"
          suffix="°"
          value={project.latitude}
          step={0.1}
          min={40}
          max={72}
          onChange={(latitude) => dispatch({ type: 'patchProject', patch: { latitude } })}
        />
        <div className="stats">
          <div className="stat">
            <span className="label">Плотность, не более</span>
            <span className="value">{fmt(norms.maxDensity)} м²/га</span>
          </div>
          <div className="stat">
            <span className="label">Застройка, не более</span>
            <span className="value">{fmt(norms.maxBuiltUpPercent)} %</span>
          </div>
          <div className="stat">
            <span className="label">Этажность, не более</span>
            <span className="value">{norms.maxFloors}</span>
          </div>
          <div className="stat">
            <span className="label">Инсоляция, не менее</span>
            <span className="value">{fmt(norms.insolationHours, 1)} ч</span>
          </div>
        </div>
      </Section>
    </>
  )
}
