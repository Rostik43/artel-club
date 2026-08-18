import { useState } from 'react'
import { useStore } from '../app/store'
import { generateVariants } from '../domain/generate'
import { normSetById } from '../domain/norms'
import { TYPOLOGIES } from '../domain/typologies'
import { Checkbox, NumberField, Section, fmt } from './primitives'

export function GeneratePanel() {
  const { state, dispatch } = useStore()
  const { project, generateOptions, variants, activeVariantId } = state
  const norms = normSetById(project.normSetId)
  const [busy, setBusy] = useState(false)

  const residential = TYPOLOGIES.filter((t) => t.kind === 'residential')

  const run = () => {
    if (project.parcel.length < 3) {
      dispatch({ type: 'setNotice', notice: { kind: 'error', text: 'Сначала задайте контур участка' } })
      return
    }
    setBusy(true)
    // Даём браузеру перерисовать состояние «считаю» до тяжёлого цикла.
    setTimeout(() => {
      try {
        const result = generateVariants(project, norms, generateOptions)
        dispatch({ type: 'setVariants', variants: result })
        if (result[0]) dispatch({ type: 'applyVariant', id: result[0].id })
        dispatch({
          type: 'setNotice',
          notice: result.length
            ? { kind: 'info', text: `Готово вариантов: ${result.length}` }
            : { kind: 'error', text: 'Не удалось разместить ни одного корпуса — проверьте отступы' },
        })
      } catch (error) {
        dispatch({ type: 'setNotice', notice: { kind: 'error', text: (error as Error).message } })
      } finally {
        setBusy(false)
      }
    }, 20)
  }

  return (
    <Section title="Генерация застройки">
      <div className="field">
        <label>Типологии в посадке</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {residential.map((t) => {
            const active = generateOptions.typologyIds.includes(t.id)
            return (
              <button
                key={t.id}
                className={`typology${active ? ' active' : ''}`}
                onClick={() =>
                  dispatch({
                    type: 'setGenerateOptions',
                    patch: {
                      typologyIds: active
                        ? generateOptions.typologyIds.filter((id) => id !== t.id)
                        : [...generateOptions.typologyIds, t.id],
                    },
                  })
                }
              >
                <span className="swatch" style={{ background: t.color }} />
                <span>{t.name}</span>
                <span className="meta">
                  {t.width}×{t.depth}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid-2">
        <NumberField
          label="Этажность, не более"
          value={generateOptions.maxFloors}
          min={1}
          max={norms.maxFloors}
          onChange={(maxFloors) => dispatch({ type: 'setGenerateOptions', patch: { maxFloors } })}
        />
        <NumberField
          label="Запас к разрывам"
          suffix="м"
          value={generateOptions.extraGap}
          min={0}
          step={1}
          onChange={(extraGap) => dispatch({ type: 'setGenerateOptions', patch: { extraGap } })}
        />
      </div>

      <Checkbox
        label="Детский сад во дворе"
        checked={generateOptions.addKindergarten}
        onChange={(addKindergarten) => dispatch({ type: 'setGenerateOptions', patch: { addKindergarten } })}
      />
      <Checkbox
        label="Школа на участке"
        checked={generateOptions.addSchool}
        onChange={(addSchool) => dispatch({ type: 'setGenerateOptions', patch: { addSchool } })}
      />
      <Checkbox
        label="Паркинг"
        checked={generateOptions.addParking}
        onChange={(addParking) => dispatch({ type: 'setGenerateOptions', patch: { addParking } })}
      />
      <Checkbox
        label="Учитывать инсоляцию в оценке варианта"
        checked={generateOptions.respectInsolation}
        onChange={(respectInsolation) => dispatch({ type: 'setGenerateOptions', patch: { respectInsolation } })}
      />

      <button className="btn primary block" onClick={run} disabled={busy}>
        {busy ? 'Считаю…' : 'Сгенерировать варианты'}
      </button>

      {variants.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {variants.map((v) => (
            <button
              key={v.id}
              className={`variant${activeVariantId === v.id ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'applyVariant', id: v.id })}
            >
              <span className="name">{v.label}</span>
              <span className="numbers">
                {fmt(v.tep.sellableArea)} м² квартир · {fmt(v.tep.density)} м²/га · {v.buildings.length} корп.
              </span>
              <span className="numbers">
                застройка {fmt(v.tep.builtUpPercent, 1)} % · инсоляция:{' '}
                {v.insolationFailures ? `${v.insolationFailures} корп. не проходят` : 'без замечаний'}
              </span>
              <span className="numbers">{v.strategy}</span>
            </button>
          ))}
        </div>
      )}

      {variants.length > 0 && (
        <p className="hint">
          Варианты отсортированы по продаваемой площади с учётом инсоляции. Любой можно доработать вручную
          инструментом «Выбор».
        </p>
      )}
    </Section>
  )
}
