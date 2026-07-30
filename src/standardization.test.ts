import { deriveAddress, normalizeAttributeValue, normalizeBehaviorValue } from './standardization'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
assert(normalizeBehaviorValue('购买').value === 'buy', 'Chinese purchase value should normalize to buy')
assert(normalizeBehaviorValue(' Add_Cart ').value === 'cart', 'English cart alias should normalize to cart')
assert(normalizeAttributeValue('  华东  ').value === '华东', 'Attributes should be trimmed')
const address = deriveAddress('浙江省杭州市西湖区')
assert(address.province === '浙江省' && address.city === '杭州市', 'Address should derive province and city')
assert(address.raw === '浙江省杭州市西湖区' && address.ruleKey === 'address-province-city', 'Address should retain raw value and rule')
