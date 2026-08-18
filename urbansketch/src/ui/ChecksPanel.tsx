import type { CheckResult } from '../domain/checks'
import type { InsolationReport } from '../domain/insolation'
import { useStore } from '../app/store'
import { Checkbox, Section, fmt, fmtHour } from './primitives'

export function ChecksPanel({
  checks,
  insolation,
}: {
  checks: CheckResult[]
  insolation: InsolationReport | null
}) {
  const { state, dispatch } = useStore()
  const errors = checks.filter((c) => c.severity === 'error').length
  const warnings = checks.filter((c) => c.severity === 'warning').length

  return (
    <>
      <Section
        title="Проверка норм"
        aside={
          <span className={`badge ${errors ? 'error' : warnings ? 'warning' : 'ok'}`}>
            {errors ? `${errors} наруш.` : warnings ? `${warnings} замеч.` : 'без замечаний'}
          </span>
        }
      >
        {checks.map((c) => (
          <div
            key={c.id}
            className="check"
            onClick={() => c.buildingIds.length && dispatch({ type: 'select', ids: c.buildingIds })}
            style={{ cursor: c.buildingIds.length ? 'pointer' : 'default' }}
          >
            <span className={`dot ${c.severity}`} />
            <div>
              <div className="title">{c.title}</div>
              <div className="msg">{c.message}</div>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Инсоляция">
        <Checkbox
          label="Показывать тени на плане"
          checked={state.showShadows}
          onChange={(showShadows) => dispatch({ type: 'setView', patch: { showShadows } })}
        />
        <Checkbox
          label="Показывать расчётные точки фасадов"
          checked={state.showInsolation}
          onChange={(showInsolation) => dispatch({ type: 'setView', patch: { showInsolation } })}
        />
        <div className="field">
          <label>Время на 22 марта: {fmtHour(state.shadowHour)}</label>
          <input
            type="range"
            min={7}
            max={17}
            step={0.5}
            value={state.shadowHour}
            onChange={(e) => dispatch({ type: 'setView', patch: { shadowHour: Number(e.target.value) } })}
          />
        </div>

        {!insolation && <p className="hint">Разместите жилые корпуса, чтобы увидеть расчёт.</p>}

        {insolation && (
          <>
            <div className="stats">
              <div className="stat">
                <span className="label">Норматив</span>
                <span className="value">{fmt(insolation.requiredHours, 1)} ч непрерывно</span>
              </div>
              <div className="stat">
                <span className="label">Корпусов не проходит</span>
                <span className={`value${insolation.failing.length ? ' over' : ''}`}>
                  {insolation.failing.length} из {Object.keys(insolation.worstByBuilding).length}
                </span>
              </div>
            </div>
            {insolation.failing.length > 0 && (
              <button
                className="btn sm block"
                onClick={() => dispatch({ type: 'select', ids: insolation.failing.map((f) => f.buildingId) })}
              >
                Выделить проблемные корпуса
              </button>
            )}
            <table className="tep">
              <thead>
                <tr>
                  <th>Корпус</th>
                  <th>Лучший фасад</th>
                  <th style={{ textAlign: 'right' }}>Непрерывно, ч</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(insolation.worstByBuilding).map((f, i) => (
                  <tr key={f.buildingId}>
                    <td>{i + 1}</td>
                    <td>{f.facade.label}</td>
                    <td
                      className="num"
                      style={{ color: f.continuousHours < insolation.requiredHours ? 'var(--error)' : undefined }}
                    >
                      {fmt(f.continuousHours, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="hint">
          Упрощённая модель: 22 марта, окна на 1,5 м, затенение только корпусами внутри участка. Для проектной
          документации нужен расчёт по СанПиН с учётом окружения и рельефа.
        </p>
      </Section>
    </>
  )
}
