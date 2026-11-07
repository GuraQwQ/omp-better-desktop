import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dir, '..');
const argument = Bun.argv.indexOf('--upstream');
if (argument < 0 || !Bun.argv[argument + 1]) throw new Error('请指定 --upstream 已准备的 OMP 源码目录。');
const upstream = path.resolve(Bun.argv[argument + 1]);
const lock = await Bun.file(path.join(root, 'upstream.lock.json')).json();
const sourceFile = path.join(upstream, 'packages/catalog/src/model-catalog-format.ts');
// 复用上游解码器，仅替换其对象判定，生成目录不需要安装上游运行依赖。
const source = (await fs.readFile(sourceFile, 'utf8')).replace('import { isRecord } from "./utils";', 'const isRecord = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);');
const decoder = await import(`data:text/javascript;base64,${Buffer.from(new Bun.Transpiler({ loader: 'ts' }).transformSync(source)).toString('base64')}`);
const catalog = decoder.openModelCatalog(await Bun.file(path.join(upstream, 'packages/catalog/src/models.json')).json());
const families: Record<string, RegExp> = {
  openai: /^gpt-6/i, anthropic: /^claude-/i, google: /^gemini-/i,
  deepseek: /^deepseek-/i, zai: /^glm-/i, xai: /^grok-/i,
  moonshot: /^(kimi|moonshot)/i, minimax: /^minimax-m/i,
  'alibaba-token-plan': /^qwen/i,
};
const fields = ['contextWindow', 'maxContextWindow', 'maxTokens', 'reasoning', 'input', 'supportsTools'];
const models: Record<string, unknown>[] = [];
for (const [provider, family] of Object.entries(families)) {
  for (const model of Object.values(decoder.getCatalogProvider(catalog, provider) ?? {}) as Record<string, unknown>[]) {
    if (typeof model.id !== 'string' || !family.test(model.id)) continue;
    models.push({ id: model.id, source: `OMP ${lock.runtimeVersion} / ${provider}`, ...Object.fromEntries(fields.filter(field => model[field] != null).map(field => [field, model[field]])) });
  }
}
models.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
await fs.writeFile(path.join(root, 'src-tauri/src/model-capabilities.json'), `${JSON.stringify({ upstreamRevision: lock.revision, models }, null, 2)}\n`, 'utf8');
console.log(`已更新 ${models.length} 个型号的精简能力目录：${pathToFileURL(sourceFile)}`);
