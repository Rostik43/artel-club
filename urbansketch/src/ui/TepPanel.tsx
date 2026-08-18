import type { NormSet } from '../domain/norms'
import type { Tep } from '../domain/tep'
import { Bar, Section, Stat, fmt } from './primitives'

export function TepPanel({ tep, norms }: { tep: Tep; norms: NormSet }) {
  const densityTone = tep.density > norms.maxDensity ? 'over' : tep.density > norms.maxDensity * 0.95 ? 'near' : undefined
  const builtTone = tep.builtUpPercent > norms.maxBuiltUpPercent ? 'over' : undefined

  return (
    <>
      <Section title="ТЭП">
        <div className="stats">
          <Stat head label="Территория" value="" />
          <Stat label="Площадь участка" value={`${fmt(tep.parcelArea)} м²`} />
          <Stat label="Пятно застройки" value={`${fmt(tep.buildableArea)} м²`} />
          <Stat label="Площадь застройки" value={`${fmt(tep.footprintArea)} м²`} />
          <Stat label="Процент застройки" value={`${fmt(tep.builtUpPercent, 1)} %`} tone={builtTone} />
        </div>
        <Bar value={tep.builtUpPercent} limit={norms.maxBuiltUpPercent} />

        <div className="stats">
          <Stat head label="Площади" value="" />
          <Stat label="Поэтажная площадь" value={`${fmt(tep.grossFloorArea)} м²`} />
          <Stat label="в т.ч. жилая" value={`${fmt(tep.residentialGfa)} м²`} />
          <Stat label="Общая площадь квартир" value={`${fmt(tep.sellableArea)} м²`} />
          <Stat label="Коммерция" value={`${fmt(tep.commercialArea)} м²`} />
        </div>

        <div className="stats">
          <Stat head label="Показатели" value="" />
          <Stat label="Плотность" value={`${fmt(tep.density)} м²/га`} tone={densityTone} />
          <Stat label="Норма плотности" value={`${fmt(norms.maxDensity)} м²/га`} />
          <Stat label="Средняя этажность" value={fmt(tep.averageFloors, 1)} />
          <Stat label="Расчётное население" value={`${fmt(tep.residents)} чел.`} />
        </div>
        <Bar value={tep.density} limit={norms.maxDensity} />
      </Section>

      <Section title="Баланс территории">
        <table className="tep">
          <thead>
            <tr>
              <th>Элемент</th>
              <th style={{ textAlign: 'right' }}>м²</th>
              <th style={{ textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Застройка', tep.balance.builtUp],
              ['Открытые стоянки', tep.balance.surfaceParking],
              ['Площадки', tep.balance.playgrounds],
              ['Озеленение (норма)', tep.balance.greenRequired],
              ['Проезды и прочее', tep.balance.drivewaysAndOther],
            ].map(([label, value]) => (
              <tr key={label as string}>
                <td>{label}</td>
                <td className="num">{fmt(value as number)}</td>
                <td className="num">
                  {tep.parcelArea > 0 ? fmt(((value as number) / tep.parcelArea) * 100, 1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tep.balance.greenDeficit > 0 && (
          <p className="hint" style={{ color: 'var(--error)' }}>
            Свободной территории не хватает на {fmt(tep.balance.greenDeficit)} м²: нужно снизить плотность,
            перевести стоянки в паркинг или добавить эксплуатируемую кровлю.
          </p>
        )}
      </Section>

      <Section title="Социальная инфраструктура" defaultOpen={false}>
        <table className="tep">
          <thead>
            <tr>
              <th>Объект</th>
              <th style={{ textAlign: 'right' }}>Требуется</th>
              <th style={{ textAlign: 'right' }}>Размещено</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Места в ДОУ</td>
              <td className="num">{fmt(tep.demand.kindergartenSeats)}</td>
              <td className="num">{fmt(tep.provided.kindergartenSeats)}</td>
            </tr>
            <tr>
              <td>Места в школах</td>
              <td className="num">{fmt(tep.demand.schoolSeats)}</td>
              <td className="num">{fmt(tep.provided.schoolSeats)}</td>
            </tr>
            <tr>
              <td>Машино-места</td>
              <td className="num">{fmt(tep.demand.parkingSpaces)}</td>
              <td className="num">{fmt(tep.provided.parkingSpaces)}</td>
            </tr>
            <tr>
              <td>Озеленение, м²</td>
              <td className="num">{fmt(tep.demand.greenArea)}</td>
              <td className="num">{fmt(tep.balance.free)}</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  )
}
