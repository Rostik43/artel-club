/**
 * Дымовой прогон расчётного ядра без браузера:
 *   npx esbuild src/dev/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
 */
import { polysArea, ringArea } from '../geo/polygon'
import { buildableArea, emptyProject, type Project } from '../domain/project'
import { normSetById } from '../domain/norms'
import { computeTep } from '../domain/tep'
import { runChecks } from '../domain/checks'
import { computeInsolation } from '../domain/insolation'
import { defaultGenerateOptions, generateVariants } from '../domain/generate'
import { SAMPLE_PARCELS } from '../samples'

const fmt = (v: number, d = 0) => v.toFixed(d)
let failures = 0
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    failures++
    console.error(`  ✗ ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

for (const sample of SAMPLE_PARCELS) {
  console.log(`\n=== ${sample.name} ===`)
  const norms = normSetById('ru-default')
  const project: Project = { ...emptyProject(), parcel: sample.ring, latitude: norms.latitude }

  const parcel = ringArea(project.parcel)
  const buildable = buildableArea(project)
  const buildableM2 = polysArea(buildable)
  console.log(`  участок ${fmt(parcel)} м², пятно ${fmt(buildableM2)} м²`)
  assert(buildableM2 > 0 && buildableM2 < parcel, 'пятно застройки меньше участка и не пустое')

  const options = { ...defaultGenerateOptions(norms), addSchool: false }
  const started = Date.now()
  const variants = generateVariants(project, norms, options)
  console.log(`  вариантов: ${variants.length} за ${Date.now() - started} мс`)
  assert(variants.length > 0, 'генератор вернул хотя бы один вариант')

  for (const variant of variants) {
    const withBuildings: Project = { ...project, buildings: variant.buildings }
    const tep = computeTep(withBuildings, norms, buildableM2)
    const checks = runChecks({ project: withBuildings, norms, buildable, tep })
    const blocking = checks.filter((c) => c.severity === 'error')
    const insolation = computeInsolation(variant.buildings, project.latitude, norms.insolationHours, 20)
    console.log(
      `  ${variant.label}: ${variant.buildings.length} корп., квартир ${fmt(tep.sellableArea)} м², ` +
        `плотность ${fmt(tep.density)} м²/га, застройка ${fmt(tep.builtUpPercent, 1)} %, ` +
        `инсоляция не проходит у ${insolation.failing.length}`,
    )
    if (blocking.length) console.log(`      нарушения: ${blocking.map((b) => `${b.title} — ${b.message}`).join('; ')}`)
    assert(variant.buildings.length > 0, `${variant.label}: корпуса размещены`)
    assert(
      !blocking.some((b) => b.id === 'gaps' || b.id === 'inside-buildable'),
      `${variant.label}: разрывы и пятно застройки соблюдены`,
    )
    assert(tep.density <= norms.maxDensity, `${variant.label}: плотность в пределах нормы`)
    assert(tep.builtUpPercent <= norms.maxBuiltUpPercent, `${variant.label}: процент застройки в пределах нормы`)
  }
}

if (failures) throw new Error(`ПРОВАЛЕНО проверок: ${failures}`)
console.log('\nВсе проверки пройдены')
