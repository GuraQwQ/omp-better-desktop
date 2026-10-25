import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';
import { lock, projectRoot, upstreamRoot } from './prepare-upstream';

interface Entry { name: string; kind: string; description: string; surface: string; source: string; rpc?: boolean; args?: string[] }
const entries: Entry[] = [];
const outputRoot = path.resolve(process.env.OMP_DESKTOP_STAGING_ROOT ?? process.env.OMP_DESKTOP_OUTPUT_ROOT ?? projectRoot);
const sourceRoot = path.join(upstreamRoot, 'packages/coding-agent/src');
const panels: Record<string, string> = {
  settings: 'settings', setup: 'settings', model: 'models', switch: 'models', login: 'providers', logout: 'providers',
  context: 'context', agents: 'agents', hub: 'agents', stats: 'usage', usage: 'usage', git: 'diff',
  jobs: 'jobs', todo: 'jobs', tree: 'tree', branch: 'tree', fork: 'tree', resume: 'sessions', session: 'sessions',
  hotkeys: 'shortcuts', extensions: 'extensions', tools: 'tools', mcp: 'mcp',
};

function prop(object: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  const member = object.properties.find(item => item.name && item.name.getText().replace(/['"]/g, '') === key);
  return member && ts.isPropertyAssignment(member) ? member.initializer : undefined;
}
function text(node: ts.Expression | undefined): string {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : '';
}
function visit(node: ts.Node, callback: (node: ts.Node) => void): void { callback(node); node.forEachChild(child => visit(child, callback)); }
async function parse(file: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(file, await Bun.file(file).text(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const help = new Map<string, string>();
visit(await parse(path.join(sourceRoot, 'cli/command-help.ts')), node => {
  if (!ts.isVariableDeclaration(node) || !node.initializer) return;
  const expression = ts.isSatisfiesExpression(node.initializer) ? node.initializer.expression : node.initializer;
  if (ts.isObjectLiteralExpression(expression)) help.set(node.name.getText(), text(prop(expression, 'description')));
});
for (const name of await fs.readdir(path.join(sourceRoot, 'commands'))) {
  if (!name.endsWith('.ts') || name === 'settings.ts') continue;
  const file = path.join(sourceRoot, 'commands', name);
  const source = await parse(file);
  if (!source.statements.some(node => ts.isClassDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))) continue;
  let description = '';
  visit(source, node => {
    if (ts.isImportSpecifier(node) && node.name.text === 'commandHelp') description = help.get(node.propertyName?.text ?? '') ?? '';
  });
  entries.push({ name: name.slice(0, -3), kind: 'cli', description, surface: 'cli', source: path.relative(upstreamRoot, file).replaceAll('\\', '/') });
}
for (const name of await fs.readdir(path.join(sourceRoot, 'slash-commands'))) {
  if (!/^builtin-(collaboration|control|lifecycle|marketplace|modes|session|skills)\.ts$/.test(name)) continue;
  const file = path.join(sourceRoot, 'slash-commands', name);
  visit(await parse(file), node => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const command = text(prop(node, 'name'));
    const rpc = Boolean(prop(node, 'handle') || node.properties.some(member => ts.isMethodDeclaration(member) && member.name.getText() === 'handle'));
    const tui = Boolean(prop(node, 'handleTui') || node.properties.some(member => ts.isMethodDeclaration(member) && member.name.getText() === 'handleTui'));
    if (!command || (!rpc && !tui)) return;
    entries.push({ name: command, kind: 'slash', description: text(prop(node, 'description')), surface: panels[command] ?? (rpc ? 'prompt' : 'terminal'), rpc, source: path.relative(upstreamRoot, file).replaceAll('\\', '/') });
  });
}
const tools = await parse(path.join(sourceRoot, 'tools/builtin-names.ts'));
visit(tools, node => {
  if (!ts.isVariableDeclaration(node) || !['BUILTIN_TOOL_NAMES', 'HIDDEN_TOOL_NAMES'].includes(node.name.getText())) return;
  const value = node.initializer && ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
  if (!value || !ts.isArrayLiteralExpression(value)) return;
  for (const item of value.elements) entries.push({ name: text(item), kind: 'tool', description: '', surface: 'tools', source: 'packages/coding-agent/src/tools/builtin-names.ts' });
});
const schemaPath = path.join(sourceRoot, 'modes/rpc/wire/rpc-wire.schema.json');
const schema = await Bun.file(schemaPath).json();
for (const command of schema['x-rpc'].commands) entries.push({ name: command.name, kind: 'rpc', description: command.doc, surface: 'rpc', source: 'packages/coding-agent/src/modes/rpc/wire/commands.ts' });

await fs.mkdir(path.join(outputRoot, 'src/generated'), { recursive: true });
await fs.mkdir(path.join(outputRoot, 'docs'), { recursive: true });
await Bun.write(path.join(outputRoot, 'src/generated/catalog.json'), JSON.stringify(entries, null, 2) + '\n');
await fs.copyFile(schemaPath, path.join(outputRoot, 'src/generated/rpc-wire.schema.json'));
await fs.copyFile(path.join(sourceRoot, 'modes/rpc/wire/rpc-wire.generated.ts'), path.join(outputRoot, 'src/generated/rpc-wire.ts'));
const rows = entries.map(entry => `| ${entry.kind} | \`${entry.name}\` | ${entry.surface} |`);
await Bun.write(path.join(outputRoot, 'docs/feature-map.md'), `# OMP feature map\n\nGenerated from upstream \`${lock.revision}\`. This is an inventory of execution surfaces, not a claim that each surface has been verified. Settings are discovered live using \`desktop_settings\`; every registry entry uses the settings form.\n\n| Kind | Capability | Surface |\n|---|---|---|\n${rows.join('\n')}\n`);
console.log(`Generated ${entries.length} capability entries and matching RPC contracts.`);
