import { useEffect, useMemo, useReducer } from 'react'
import { StoreContext, initialState, reducer } from './store'
import { buildableArea } from '../domain/project'
import { normSetById } from '../domain/norms'
import { computeTep } from '../domain/tep'
import { runChecks } from '../domain/checks'
import { computeInsolation } from '../domain/insolation'
import { polysArea } from '../geo/polygon'
import { Plan } from '../ui/Plan'
import { SitePanel } from '../ui/SitePanel'
import { GeneratePanel } from '../ui/GeneratePanel'
import { BuildingPanel } from '../ui/BuildingPanel'
import { TepPanel } from '../ui/TepPanel'
import { ChecksPanel } from '../ui/ChecksPanel'
import { ExportPanel } from '../ui/ExportPanel'
import { fmt } from '../ui/primitives'

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const store = useMemo(() => ({ state, dispatch }), [state])
  const { project } = state

  const norms = useMemo(() => normSetById(project.normSetId), [project.normSetId])
  const buildable = useMemo(() => buildableArea(project), [project])
  const tep = useMemo(() => computeTep(project, norms, polysArea(buildable)), [project, norms, buildable])
  const insolation = useMemo(
    () =>
      project.buildings.length
        ? computeInsolation(project.buildings, project.latitude, norms.insolationHours)
        : null,
    [project.buildings, project.latitude, norms.insolationHours],
  )
  const checks = useMemo(
    () => runChecks({ project, norms, buildable, tep }),
    [project, norms, buildable, tep],
  )

  const problemIds = useMemo(() => {
    const ids = new Set<string>()
    for (const check of checks) {
      if (check.severity === 'error') check.buildingIds.forEach((id) => ids.add(id))
    }
    insolation?.failing.forEach((f) => ids.add(f.buildingId))
    return ids
  }, [checks, insolation])

  useEffect(() => {
    if (!state.notice) return
    const timer = setTimeout(() => dispatch({ type: 'setNotice', notice: null }), 4000)
    return () => clearTimeout(timer)
  }, [state.notice])

  return (
    <StoreContext.Provider value={store}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            UrbanSketch<small>оценка потенциала участка</small>
          </div>
          <div className="topbar-spacer" />
          <span className="hint">
            {project.parcel.length
              ? `${fmt(tep.parcelHa, 2)} га · ${project.buildings.length} корп. · ${fmt(tep.sellableArea)} м² квартир`
              : 'Участок не задан'}
          </span>
          <div className="btn-group">
            <button className="btn sm" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length}>
              Отменить
            </button>
            <button className="btn sm" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length}>
              Вернуть
            </button>
          </div>
        </header>

        <div className="workspace">
          <aside className="panel">
            <SitePanel />
            <GeneratePanel />
            <BuildingPanel />
          </aside>

          <div style={{ position: 'relative', minWidth: 0 }}>
            <Plan buildable={buildable} insolation={insolation} problemIds={problemIds} />
            {state.notice && <div className={`notice ${state.notice.kind}`}>{state.notice.text}</div>}
          </div>

          <aside className="panel right">
            <TepPanel tep={tep} norms={norms} />
            <ChecksPanel checks={checks} insolation={insolation} />
            <ExportPanel tep={tep} norms={norms} buildable={buildable} />
            <p className="disclaimer">
              Инструмент предпроектной оценки. Значения нормативов — редактируемые пресеты, расчёт инсоляции
              упрощённый. Результаты не заменяют проектную документацию и требуют проверки специалистом.
            </p>
          </aside>
        </div>
      </div>
    </StoreContext.Provider>
  )
}
