import { availableAnalysisPages } from './analysisPages'
import type { MetricCapability } from './importSession'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const capability = (key: string, available: boolean): MetricCapability => ({
  key,
  label: key,
  available,
  definition: { source: 'test', granularity: 'test', formula: 'test', dedupKey: 'test' },
})

const withoutChannel = availableAnalysisPages([capability('gmv', true)], true)
assert(!withoutChannel.some(page => page.key === '渠道分析'), 'Channel page should stay hidden without channel capability')
assert(withoutChannel.some(page => page.key === '经营总览'), 'Overview should always be available')
assert(withoutChannel.some(page => page.key === '数据导入'), 'Import page should always be available')
assert(withoutChannel.some(page => page.key === '字段确认'), 'Field confirmation page should be available for navigation')

const withBehavior = availableAnalysisPages([capability('funnel', true)], true)
assert(withBehavior.some(page => page.key === '行为分析'), 'Behavior page should be available with funnel capability')

const withCatalog = availableAnalysisPages([
  capability('product_rank', true),
  capability('category_rank', true),
], true)
assert(withCatalog.filter(page => page.key === '商品和品类分析').length === 1, 'Catalog analysis should be a single combined page')
assert(!withCatalog.some(page => page.key === '商品分析' || page.key === '品类分析'), 'Legacy separate catalog pages should be hidden')
