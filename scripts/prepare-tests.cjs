const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const output = join(__dirname, '..', '.test-dist')
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'package.json'), '{"type":"module"}\n')
for (const file of ['analysisPages.test.ts', 'standardization.test.ts', 'mappingTemplates.test.ts', 'metricEngine.test.ts']) {
  require('node:fs').copyFileSync(join(__dirname, '..', 'src', file), join(output, file))
}
