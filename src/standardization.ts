export type StandardizationRule = {
  key: string
  sourceField: string
  targetField: string
  description: string
}

export type StandardizedValue = {
  raw: string
  value: string
  ruleKey: string
}

export const standardizationRules: StandardizationRule[] = [
  { key: 'behavior-normalize', sourceField: 'behavior', targetField: 'behavior_normalized', description: '将中英文行为值归一化为 pv、fav、cart、buy' },
  { key: 'address-province-city', sourceField: 'address', targetField: 'province/city', description: '从地址文本派生省份和城市，同时保留原地址' },
  { key: 'user-attribute-trim', sourceField: 'occupation/user_segment', targetField: 'normalized attribute', description: '清理用户属性空白并保留原始值' },
]

const behaviorAliases: Record<string, string> = {
  buy: 'buy', purchase: 'buy', payment: 'buy', 购买: 'buy', 支付: 'buy',
  pv: 'pv', view: 'pv', click: 'pv', 浏览: 'pv', 点击: 'pv',
  fav: 'fav', favorite: 'fav', 收藏: 'fav',
  cart: 'cart', add_cart: 'cart', 加购: 'cart', 加入购物车: 'cart',
}

export const normalizeBehaviorValue = (raw: string): StandardizedValue => ({
  raw,
  value: behaviorAliases[raw.trim().toLowerCase()] ?? raw.trim().toLowerCase(),
  ruleKey: 'behavior-normalize',
})

export const normalizeAttributeValue = (raw: string): StandardizedValue => ({ raw, value: raw.trim(), ruleKey: 'user-attribute-trim' })

export const deriveAddress = (raw: string): { raw: string; province: string; city: string; ruleKey: string } => {
  const value = raw.trim()
  const province = value.match(/^(北京|上海|天津|重庆|[^省]{2,8}省|[^自治区]{2,8}自治区|[^特别行政区]{2,8}特别行政区)/)?.[1] ?? ''
  const rest = value.slice(province.length)
  const city = rest.match(/^([^市]{2,8}市|[^州]{2,8}州|[^盟]{2,8}盟)/)?.[1] ?? ''
  return { raw, province, city, ruleKey: 'address-province-city' }
}
