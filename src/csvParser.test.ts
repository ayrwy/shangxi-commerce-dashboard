import { detectDelimiter, parseCsv } from './csvParser'

const quotedCsv = 'name,amount,note\r\n"桌子,原木色",2,"促销,第二件半价"\r\n"带""引号""",1,ok'
const quotedResult = parseCsv(quotedCsv)

if (quotedResult.headers.join('|') !== 'name|amount|note') throw new Error('CSV 表头解析失败')
if (quotedResult.rows[0]?.[0] !== '桌子,原木色') throw new Error('字段内逗号解析失败')
if (quotedResult.rows[0]?.[2] !== '促销,第二件半价') throw new Error('引号字段解析失败')
if (quotedResult.rows[1]?.[0] !== '带\"引号\"') throw new Error('转义双引号解析失败')
if (quotedResult.totalRows !== 2) throw new Error('总行数统计失败')

const mixedLineEndings = parseCsv('a;b\r1;2\n3;4\r5;6')
if (detectDelimiter('a;b\r1;2') !== ';' || mixedLineEndings.delimiter !== ';') throw new Error('分隔符识别失败')
if (mixedLineEndings.totalRows !== 3) throw new Error('混合换行解析失败')

const mismatched = parseCsv('a,b\n1\n2,3,4')
if (!mismatched.parseWarnings.some(warning => warning.includes('第 2 行'))) throw new Error('列数异常未生成警告')
