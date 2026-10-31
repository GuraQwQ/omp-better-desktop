import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface BenchCase { id: string; title: string; complexity: 'low' | 'medium' | 'high' }
export interface BenchCheck { name: string; passed: boolean; detail?: string }
export interface BenchResult { passed: boolean; checks: BenchCheck[] }
interface Skill { name: string; description: string; body: string }
interface Definition { files: Record<string, string>; protected: string[]; prompt: string; skill?: Skill }
interface Line { sku: string; unitPriceCents: number; quantity: number }
interface Config { service: string; environment: string; database: { tls: boolean }; maxAttempts: number; timeoutMs: number; endpoints: string[] }
interface Tables {
  customers: { id: string; region: string }[];
  products: { sku: string; unitPriceCents: number }[];
  orders: { id: string; customerId: string; status: string }[];
  items: { orderId: string; sku: string; quantity: number }[];
  refunds: { orderId: string; amountCents: number; status: string }[];
}

export const cases: BenchCase[] = [
  { id: 'rounding', title: '订单整数分分摊修复', complexity: 'low' },
  { id: 'cli', title: '订单 JSON 命令行接口', complexity: 'medium' },
  { id: 'log-diagnosis', title: '订单日志定位与修复', complexity: 'medium' },
  { id: 'config-audit', title: '多服务配置巡检', complexity: 'high' },
  { id: 'sales-report', title: '订单与退款多表聚合', complexity: 'high' },
  { id: 'skill-import', title: '技能指导的金额导入', complexity: 'low' },
];

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const splitSource = [
  'export function splitCents(totalCents, weights) {',
  '  const sum = weights.reduce((a, b) => a + b, 0);',
  '  const shares = weights.map((weight, index) => ({ index, cents: Number(BigInt(totalCents) * BigInt(weight) / BigInt(sum)), remainder: BigInt(totalCents) * BigInt(weight) % BigInt(sum) }));',
  '  const remaining = totalCents - shares.reduce((n, share) => n + share.cents, 0);',
  '  shares.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);',
  '  for (let i = 0; i < remaining; i++) shares[i].cents++;',
  '  return shares.sort((a, b) => a.index - b.index).map(share => share.cents);',
  '}', '',
].join('\n');
const orderSource = [
  "import { splitCents } from './split-cents.mjs';",
  'export function calculateDiscountLines(lines, discountCents) {',
  "  if (!Number.isSafeInteger(discountCents) || discountCents < 0) throw new Error('优惠金额必须为非负整数分');",
  '  const subtotals = lines.map(line => {',
  "    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('商品单价与数量无效');",
  '    const subtotal = line.unitPriceCents * line.quantity;',
  "    if (!Number.isSafeInteger(subtotal)) throw new Error('商品金额超出整数范围');",
  '    return subtotal;',
  '  });',
  '  const total = subtotals.reduce((a, b) => a + b, 0);',
  "  if (!Number.isSafeInteger(total) || discountCents > total) throw new Error('优惠金额不能超过订单总额');",
  '  const shares = discountCents === 0 ? subtotals.map(() => 0) : splitCents(discountCents, subtotals);',
  '  return lines.map((line, i) => ({ sku: line.sku, subtotalCents: subtotals[i], discountCents: shares[i], payableCents: subtotals[i] - shares[i] }));',
  '}', '',
].join('\n');
const orderTests = [
  "import assert from 'node:assert/strict';",
  "import test from 'node:test';",
  "import { calculateDiscountLines as calculate } from './src/order-discount.mjs';",
  "const lines = ['A', 'B', 'C'].map(sku => ({sku, unitPriceCents:100, quantity:1}));",
  'const amounts = (input, cents) => calculate(input, cents).map(row => row.discountCents);',
  "test('可整除', () => assert.deepEqual(amounts(lines,300),[100,100,100]));",
  "test('守恒与稳定余数', () => assert.deepEqual(amounts(lines,100),[34,33,33]));",
  "test('一分钱', () => assert.deepEqual(amounts(lines,1),[1,0,0]));",
  "test('包含数量', () => assert.deepEqual(amounts(lines.map((row,i)=>({...row,quantity:i+1})),7),[1,2,4]));",
  "test('零值与空订单', () => { assert.deepEqual(calculate([],0),[]); assert.deepEqual(amounts(lines,0),[0,0,0]); assert.deepEqual(amounts([{sku:'免费',unitPriceCents:0,quantity:1},{sku:'收费',unitPriceCents:200,quantity:1}],1),[0,1]); });",
  "test('输入校验', () => { for (const cents of [-1,0.5,301]) assert.throws(()=>calculate(lines,cents)); assert.throws(()=>calculate([{sku:'A',unitPriceCents:100,quantity:0}],1)); });", '',
].join('\n');
const common = '仅修改当前任务目录，保留原始测试、README 和输入数据，不添加依赖。完成后运行适当验证，并简短说明结果。';

function configurations(seed: number, count: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const n = i + seed;
    files['service-' + String(i).padStart(2, '0') + '.json'] = json({
      service: 'service-' + n, environment: n % 3 === 0 ? 'staging' : 'production',
      database: { tls: n % 5 !== 0 }, maxAttempts: n % 7 === 0 ? 9 : n % 13 === 0 ? 2.5 : n % 4 + 1,
      timeoutMs: n % 11 === 0 ? 0 : n % 17 === 0 ? 60001 : 1000 + n * 100,
      endpoints: ['https://api.example.invalid/' + n, (n % 4 === 0 ? 'http' : 'https') + '://health.example.invalid/' + n],
    });
  }
  return files;
}

function auditExpected(files: Record<string, string>) {
  return Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).flatMap(([file, text]) => {
    const c = JSON.parse(text) as Config, issues: string[] = [];
    if (c.environment === 'production' && !c.database.tls) issues.push('DB_TLS_REQUIRED');
    if (!Number.isInteger(c.maxAttempts) || c.maxAttempts < 1 || c.maxAttempts > 5) issues.push('RETRY_RANGE');
    if (c.environment === 'production' && c.endpoints.some(url => !url.startsWith('https://'))) issues.push('INSECURE_ENDPOINT');
    if (!Number.isInteger(c.timeoutMs) || c.timeoutMs < 1 || c.timeoutMs > 60000) issues.push('TIMEOUT_RANGE');
    return issues.length ? [{ file, service: c.service, issues: issues.sort() }] : [];
  });
}

function salesTables(seed: number, count: number): Tables {
  const t: Tables = { customers: [], products: [], orders: [], items: [], refunds: [] };
  for (let i = 0; i < 24; i++) t.customers.push({ id: 'C' + i, region: ['华东', '华北', '华南'][(i + seed) % 3] });
  for (let i = 0; i < 12; i++) t.products.push({ sku: 'SKU' + i, unitPriceCents: 100 + ((i * 31 + seed) % 20) * 25 });
  for (let i = 0; i < count; i++) {
    const id = 'O' + String(i).padStart(4, '0'), n = i + seed;
    t.orders.push({ id, customerId: 'C' + n % 24, status: n % 5 === 0 ? 'cancelled' : n % 7 === 0 ? 'pending' : 'paid' });
    for (let j = 0; j < n % 3 + 1; j++) t.items.push({ orderId: id, sku: 'SKU' + (n + j) % 12, quantity: (n + j) % 4 + 1 });
    if (n % 3 === 0) t.refunds.push({ orderId: id, amountCents: 25 + n % 40, status: n % 2 === 0 ? 'approved' : 'pending' });
  }
  return t;
}

function salesExpected(t: Tables) {
  const result = new Map<string, { region: string; orderCount: number; grossCents: number; refundCents: number; netCents: number }>();
  for (const order of t.orders) {
    if (order.status !== 'paid') continue;
    const region = t.customers.find(row => row.id === order.customerId)!.region;
    const row = result.get(region) ?? { region, orderCount: 0, grossCents: 0, refundCents: 0, netCents: 0 };
    row.orderCount++;
    for (const item of t.items.filter(item => item.orderId === order.id)) row.grossCents += item.quantity * t.products.find(product => product.sku === item.sku)!.unitPriceCents;
    for (const refund of t.refunds.filter(refund => refund.orderId === order.id && refund.status === 'approved')) row.refundCents += refund.amountCents;
    row.netCents = row.grossCents - row.refundCents;
    result.set(region, row);
  }
  return [...result.values()].sort((a, b) => a.region < b.region ? -1 : a.region > b.region ? 1 : 0);
}

function logs() {
  const records: Record<string, unknown>[] = [];
  for (let i = 0; i < 360; i++) {
    const lines: Line[] = [{ sku: 'SKU-A', unitPriceCents: 125 + i % 5 * 25, quantity: i >= 24 && i % 7 === 0 ? 3 : 1 }, { sku: 'SKU-B', unitPriceCents: 200, quantity: 1 }];
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents, 0);
    const orderId = 'ORDER-' + String(i).padStart(4, '0');
    records.push({ event: 'order_received', orderId, lines, discountCents: 7 });
    records.push({ event: 'order_priced', orderId, subtotalCents, payableCents: subtotalCents - 7 });
  }
  return records;
}

function definition(caseId: string): Definition {
  const files: Record<string, string> = {}, immutable: string[] = [];
  let prompt = '', skill: Skill | undefined;
  if (['rounding', 'cli', 'log-diagnosis'].includes(caseId)) {
    files['src/split-cents.mjs'] = splitSource;
    files['src/order-discount.mjs'] = orderSource;
    files['test.mjs'] = orderTests;
    immutable.push('test.mjs');
  }
  switch (caseId) {
    case 'rounding':
      files['src/split-cents.mjs'] = 'export function splitCents(totalCents, weights) {\n  const sum = weights.reduce((a, b) => a + b, 0);\n  return weights.map(weight => Math.round(totalCents * weight / sum));\n}\n';
      prompt = '修复订单优惠分摊的整数分守恒错误。现有 API 为 src/order-discount.mjs 的 calculateDiscountLines(lines, discountCents)。按照单价乘数量的权重分配：先取整，剩余分按小数余数降序补足，同余数按输入顺序。保留输入校验、空订单、零金额和零价商品行为，保持返回字段。运行 node test.mjs。';
      break;
    case 'cli':
      files['example.json'] = json([{ sku: '茶叶', unitPriceCents: 100, quantity: 1 }, { sku: 'B', unitPriceCents: 100, quantity: 2 }, { sku: 'C', unitPriceCents: 100, quantity: 3 }]);
      immutable.push('example.json');
      prompt = '为现有订单模块新增 cli.mjs：node cli.mjs --input <JSON文件> --discount <整数分>。输入是商品数组，复用 calculateDiscountLines，不复制分摊算法。stdout 仅输出 JSON 对象 {lines,subtotalCents,discountCents,payableCents}；lines 与现有 API 返回一致，保留商品顺序及中文 SKU。参数缺失、重复、未知、非法 JSON 或业务校验失败时退出码 2，说明写 stderr，stdout 为空。支持参数顺序变化、空订单与零价行。运行原测试并验证 CLI。';
      break;
    case 'log-diagnosis':
      files['src/order-discount.mjs'] = orderSource.replace('line.unitPriceCents * line.quantity', 'line.unitPriceCents');
      files['orders.jsonl'] = logs().map(row => JSON.stringify(row)).join('\n') + '\n';
      immutable.push('orders.jsonl');
      prompt = 'orders.jsonl 是生产形态的订单接收与计价日志。找出第一笔计价不正确的订单，修复 src/order-discount.mjs 的根因，保留接口和校验。新增 diagnosis.json，字段为 orderId、line（错误 order_priced 记录的1基行号）、expectedSubtotalCents、actualSubtotalCents、cause。若根因是漏乘数量，cause 使用 quantity_not_applied。不要改日志。运行 node test.mjs。';
      break;
    case 'config-audit':
      for (const [name, text] of Object.entries(configurations(0, 30))) files['configs/' + name] = text;
      immutable.push(...Object.keys(files));
      prompt = '实现 audit.mjs：node audit.mjs <配置目录> 读取该目录所有 .json 服务配置并输出纯 JSON 数组。规则：production 的 database.tls 必须 true（DB_TLS_REQUIRED）；maxAttempts 必须为1到5的整数（RETRY_RANGE）；production 的全部 endpoints 必须以 https:// 开头（INSECURE_ENDPOINT）；timeoutMs 必须为1到60000的整数（TIMEOUT_RANGE）。只列出有问题的文件，每项 {file,service,issues}，file 为文件名，文件按文件名升序，issues 为排序后的唯一代码数组。staging 不受 production 专属规则限制。不得修改配置；实现应适用于其它同结构目录，而非硬编码当前报告。';
      break;
    case 'sales-report':
      for (const [name, rows] of Object.entries(salesTables(0, 160))) files['data/' + name + '.json'] = json(rows);
      immutable.push(...Object.keys(files));
      prompt = '实现 report.mjs：node report.mjs <数据目录> 读取 customers/products/orders/items/refunds 五个 JSON 数组，按客户 region 汇总。仅纳入 status=paid 的订单；grossCents 为商品目录单价乘订单项 quantity；仅扣除这些订单 status=approved 的退款；orderCount 计订单数，不能因多商品或退款重复计数。stdout 输出纯 JSON 数组，各项 {region,orderCount,grossCents,refundCents,netCents}，region 使用 JavaScript 字符串比较升序，仅输出存在已支付订单的地区。所有金额为整数分。不得修改数据，实现必须适用于其它同结构输入。';
      break;
    case 'skill-import':
      skill = {
        name: 'ledger-import',
        description: '导入账本金额记录时使用。定义严格整数分转换、逐行错误、首次有效标识保留和稳定顺序的业务规则，适用于实现或检查导入程序，避免浮点金额与重复记录造成账本不一致。',
        body: '# 账本导入规则\n\n实现 normalizeRows(rows)，返回 {accepted, errors}，不得修改输入。按原顺序逐行检查；errors 每项 {index, code}，index 从0开始，一行最多一个错误。先校验 id：必须是非空字符串，去掉两端空白，否则 code=id。然后校验 amount：必须是字符串，去掉两端空白后为非负十进制金额，可为整数或1到2位小数；仅允许 ASCII 数字，整数部分除0以外不能以0开头，不允许正负号、指数、逗号或小数点后为空。换算后的整数分不能超过 Number.MAX_SAFE_INTEGER，否则 code=amount。金额合法后才检查去空白的 id 是否已被 accepted 使用，重复则 code=duplicate。无效记录不占用 id。accepted 每项 {id, amountCents}，按输入顺序保留。使用整数或 BigInt 运算，不能用浮点四舍五入接受非法格式。最终简短说明运行了哪些验证。\n',
      };
      files['normalize-import.mjs'] = "export function normalizeRows(rows) {\n  throw new Error('尚未实现');\n}\n";
      prompt = '请先阅读已启用的 ledger-import 技能，再实现 normalize-import.mjs 的 normalizeRows(rows)。返回结构与逐行校验规则以该技能为准。保留公开导出，用不同合法和非法金额及重复标识验证，不能修改输入数据或引入依赖。';
      break;
    default: throw new Error('未知基准任务：' + caseId);
  }
  prompt += '\n' + common;
  files['README.md'] = '# ' + cases.find(item => item.id === caseId)!.title + '\n\n' + prompt + '\n';
  immutable.push('README.md');
  return { files, protected: immutable, prompt, skill };
}

export async function prepareCase(caseId: string, directory: string): Promise<{ prompt: string; skill?: Skill }> {
  const d = definition(caseId), root = path.resolve(directory);
  await fs.mkdir(root, { recursive: true });
  if ((await fs.readdir(root)).length) throw new Error('基准任务目录必须为空：' + root);
  for (const [name, text] of Object.entries(d.files)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');
  }
  return { prompt: d.prompt, ...(d.skill ? { skill: d.skill } : {}) };
}

async function run(directory: string, args: string[], input = '') {
  const child = Bun.spawn(['node', ...args], { cwd: directory, stdin: new TextEncoder().encode(input), stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(15000) });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, out, err };
}

async function expression(directory: string, code: string, input: unknown) {
  const result = await run(directory, ['--input-type=module', '-e', "let input=''; for await (const part of process.stdin) input+=part; const value=JSON.parse(input);\n" + code], JSON.stringify(input));
  assert.equal(result.code, 0, result.err.slice(-500));
  return JSON.parse(result.out) as unknown;
}

async function dataset<T>(directory: string, files: Record<string, string>, action: (folder: string) => Promise<T>): Promise<T> {
  const root = await fs.realpath(directory), folder = await fs.mkdtemp(path.join(root, '.oracle-'));
  try {
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(folder, name), content, 'utf8');
    return await action(folder);
  } finally {
    assert.equal(path.dirname(await fs.realpath(folder)), root);
    await fs.rm(folder, { recursive: true });
  }
}

function expectedOrder(lines: Line[], discount: number) {
  const totals = lines.map(line => line.unitPriceCents * line.quantity), sum = totals.reduce((a, b) => a + b, 0);
  const shares = totals.map(weight => discount ? Number(BigInt(discount) * BigInt(weight) / BigInt(sum)) : 0);
  if (discount) {
    const indices = totals.map((_, i) => i).sort((a, b) => {
      const x = BigInt(discount) * BigInt(totals[a]) % BigInt(sum), y = BigInt(discount) * BigInt(totals[b]) % BigInt(sum);
      return x === y ? a - b : x > y ? -1 : 1;
    });
    const remaining = discount - shares.reduce((a, b) => a + b, 0);
    for (let i = 0; i < remaining; i++) shares[indices[i]]++;
  }
  return lines.map((line, i) => ({ sku: line.sku, subtotalCents: totals[i], discountCents: shares[i], payableCents: totals[i] - shares[i] }));
}

function orderSamples() {
  const samples: { lines: Line[]; discount: number; invalid?: boolean }[] = [{ lines: [], discount: 0 }];
  for (let i = 0; i < 32; i++) {
    const lines = Array.from({ length: i % 6 + 1 }, (_, j) => ({ sku: '商品-' + j, unitPriceCents: (i * 17 + j * 29) % 251, quantity: j % 4 + 1 }));
    const total = lines.reduce((n, line) => n + line.unitPriceCents * line.quantity, 0);
    samples.push({ lines, discount: total ? (i * 97 + 1) % (total + 1) : 0 });
  }
  const equal = ['A', 'B', 'C'].map(sku => ({ sku, unitPriceCents: 100, quantity: 1 }));
  for (const discount of [1, 100, 300]) samples.push({ lines: equal, discount });
  samples.push({ lines: [{ sku: 'big', unitPriceCents: Number.MAX_SAFE_INTEGER, quantity: 1 }], discount: Number.MAX_SAFE_INTEGER - 1 });
  for (const discount of [-1, 0.1, 301]) samples.push({ lines: equal, discount, invalid: true });
  samples.push({ lines: [{ sku: 'bad', unitPriceCents: 1, quantity: 0 }], discount: 0, invalid: true });
  samples.push({ lines: [{ sku: 'bad', unitPriceCents: Number.MAX_SAFE_INTEGER, quantity: 2 }], discount: 0, invalid: true });
  return samples;
}

export async function verifyCase(caseId: string, directory: string): Promise<BenchResult> {
  const d = definition(caseId), root = path.resolve(directory), checks: BenchCheck[] = [];
  const check = async (name: string, action: () => Promise<void>) => {
    try { await action(); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false, detail: String(error).slice(0, 500) }); }
  };
  await check('保护文件保持原样', async () => {
    for (const name of d.protected) assert.equal(await fs.readFile(path.join(root, name), 'utf8'), d.files[name], name);
  });
  if (['rounding', 'cli', 'log-diagnosis'].includes(caseId)) {
    await check('原有六项测试', async () => { const result = await run(root, ['test.mjs']); assert.equal(result.code, 0, result.out.slice(-500) + result.err.slice(-200)); });
    await check('外部金额与校验用例', async () => {
      const samples = orderSamples();
      const actual = await expression(root, "const {calculateDiscountLines:fn}=await import('./src/order-discount.mjs'); process.stdout.write(JSON.stringify(value.map(s=>{try{return {rows:fn(s.lines,s.discount)}}catch{return {error:true}}})));", samples);
      assert.deepEqual(actual, samples.map(s => s.invalid ? { error: true } : { rows: expectedOrder(s.lines, s.discount) }));
    });
  }
  if (caseId === 'cli') {
    await check('CLI 合法与错误路径', async () => {
      for (const sample of orderSamples().filter(s => !s.invalid).slice(0, 8)) {
        await dataset(root, { 'input.json': json(sample.lines) }, async folder => {
          const result = await run(root, ['cli.mjs', '--discount', String(sample.discount), '--input', path.join(folder, 'input.json')]);
          assert.equal(result.code, 0, result.err);
          const lines = expectedOrder(sample.lines, sample.discount), subtotalCents = lines.reduce((n, row) => n + row.subtotalCents, 0);
          assert.deepEqual(JSON.parse(result.out), { lines, subtotalCents, discountCents: sample.discount, payableCents: subtotalCents - sample.discount });
        });
      }
      await dataset(root, { 'invalid.json': '{', 'input.json': '[]' }, async folder => {
        for (const args of [[], ['--input', path.join(folder, 'invalid.json'), '--discount', '0'], ['--input', path.join(folder, 'input.json'), '--discount', '-1'], ['--input', path.join(folder, 'input.json'), '--discount', '0', '--discount', '0'], ['--input', path.join(folder, 'input.json'), '--discount', '0', '--unknown', '1']]) {
          const result = await run(root, ['cli.mjs', ...args]);
          assert.equal(result.code, 2); assert.equal(result.out, ''); assert(result.err.trim());
        }
      });
    });
  }
  if (caseId === 'log-diagnosis') await check('日志证据与根因', async () => {
    const rows = logs();
    const i = rows.findIndex((row, index) => row.event === 'order_priced' && row.subtotalCents !== (rows[index - 1].lines as Line[]).reduce((n, item) => n + item.unitPriceCents * item.quantity, 0));
    const expected = { orderId: rows[i].orderId, line: i + 1, expectedSubtotalCents: (rows[i - 1].lines as Line[]).reduce((n, item) => n + item.unitPriceCents * item.quantity, 0), actualSubtotalCents: rows[i].subtotalCents, cause: 'quantity_not_applied' };
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'diagnosis.json'), 'utf8')), expected);
  });
  if (caseId === 'config-audit') await check('配置巡检与替换输入', async () => {
    for (const [seed, count] of [[0, 30], [17, 13]]) {
      const files = configurations(seed, count);
      await dataset(root, files, async folder => { const result = await run(root, ['audit.mjs', folder]); assert.equal(result.code, 0, result.err); assert.deepEqual(JSON.parse(result.out), auditExpected(files)); });
    }
  });
  if (caseId === 'sales-report') await check('多表汇总与替换输入', async () => {
    for (const [seed, count] of [[0, 160], [19, 37]]) {
      const tables = salesTables(seed, count), files = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name + '.json', json(rows)]));
      await dataset(root, files, async folder => { const result = await run(root, ['report.mjs', folder]); assert.equal(result.code, 0, result.err); assert.deepEqual(JSON.parse(result.out), salesExpected(tables)); });
    }
  });
  if (caseId === 'skill-import') await check('技能规则与输入不变', async () => {
    const rows = [
      { id: ' A ', amount: '12.34' }, { id: 'A', amount: '2' }, { id: 'bad', amount: '-1' }, { id: 'bad', amount: '0.01' },
      { id: '', amount: '1' }, { id: 'B', amount: '01.00' }, { id: 'B', amount: ' 1.2 ' }, { id: 'C', amount: '1e2' },
      { id: 'D', amount: '1.234' }, { id: 'E', amount: 5 }, { id: 'MAX', amount: '90071992547409.91' },
      { id: 'TOO', amount: '90071992547409.92' }, { id: '零', amount: '0' }, { id: '点', amount: '2.' },
      { id: 3, amount: '1' }, { id: '全角', amount: '１.２０' }, { id: 'PLUS', amount: '+1' },
    ];
    const actual = await expression(root, "const {normalizeRows}=await import('./normalize-import.mjs'); const before=JSON.stringify(value);const result=normalizeRows(value);process.stdout.write(JSON.stringify({result,unchanged:JSON.stringify(value)===before}));", rows);
    assert.deepEqual(actual, { result: {
      accepted: [{ id: 'A', amountCents: 1234 }, { id: 'bad', amountCents: 1 }, { id: 'B', amountCents: 120 }, { id: 'MAX', amountCents: Number.MAX_SAFE_INTEGER }, { id: '零', amountCents: 0 }],
      errors: [{ index: 1, code: 'duplicate' }, { index: 2, code: 'amount' }, { index: 4, code: 'id' }, { index: 5, code: 'amount' }, { index: 7, code: 'amount' }, { index: 8, code: 'amount' }, { index: 9, code: 'amount' }, { index: 11, code: 'amount' }, { index: 13, code: 'amount' }, { index: 14, code: 'id' }, { index: 15, code: 'amount' }, { index: 16, code: 'amount' }],
    }, unchanged: true });
    assert.deepEqual(await expression(root, "const {normalizeRows}=await import('./normalize-import.mjs');process.stdout.write(JSON.stringify(normalizeRows(value)));", []), { accepted: [], errors: [] });
  });
  return { passed: checks.every(item => item.passed), checks };
}
