import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { cases, prepareCase, verifyCase } from './token-bench/fixtures';

const base = path.resolve(import.meta.dir, '../.cache/token-bench-fixture-check');
await fs.mkdir(base, { recursive: true });
const root = await fs.mkdtemp(path.join(base, 'check-'));
const correctSplit = [
  'export function splitCents(totalCents, weights) {',
  '  const sum = weights.reduce((n,w)=>n+BigInt(w),0n);',
  '  const rows = weights.map((w,index)=>({index, quotient:BigInt(totalCents)*BigInt(w)/sum, rem:BigInt(totalCents)*BigInt(w)%sum}));',
  '  let missing = BigInt(totalCents)-rows.reduce((n,row)=>n+row.quotient,0n);',
  '  rows.sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1);',
  '  for (const row of rows) { if (!missing) break; row.quotient++; missing--; }',
  '  rows.sort((a,b)=>a.index-b.index); return rows.map(row=>Number(row.quotient));',
  '}', '',
].join('\n');
const cli = [
  "import fs from 'node:fs/promises';",
  "import {calculateDiscountLines} from './src/order-discount.mjs';",
  'try {',
  '  const args=process.argv.slice(2), options={};',
  "  for(let i=0;i<args.length;i+=2) { const key=args[i]; if(!['--input','--discount'].includes(key)||Object.hasOwn(options,key)||args[i+1]===undefined) throw Error('参数错误'); options[key]=args[i+1]; }",
  "  if(!Object.hasOwn(options,'--input')||!Object.hasOwn(options,'--discount')) throw Error('缺少参数');",
  "  const amount=Number(options['--discount']);",
  "  const lines=calculateDiscountLines(JSON.parse(await fs.readFile(options['--input'],'utf8')),amount);",
  '  const subtotalCents=lines.reduce((n,row)=>n+row.subtotalCents,0);',
  '  console.log(JSON.stringify({lines,subtotalCents,discountCents:amount,payableCents:subtotalCents-amount}));',
  '} catch(error) { console.error(error.message); process.exitCode=2; }', '',
].join('\n');
const audit = [
  "import fs from 'node:fs/promises'; import path from 'node:path';",
  'const root=process.argv[2], rows=[];',
  "for(const file of (await fs.readdir(root)).filter(file=>file.endsWith('.json')).sort()) {",
  "  const c=JSON.parse(await fs.readFile(path.join(root,file),'utf8')), issues=[];",
  "  if(c.environment==='production') { if(c.database.tls!==true) issues.push('DB_TLS_REQUIRED'); if(c.endpoints.some(value=>!value.startsWith('https://'))) issues.push('INSECURE_ENDPOINT'); }",
  "  if(!Number.isInteger(c.maxAttempts)||c.maxAttempts<1||c.maxAttempts>5) issues.push('RETRY_RANGE');",
  "  if(!Number.isInteger(c.timeoutMs)||c.timeoutMs<1||c.timeoutMs>60000) issues.push('TIMEOUT_RANGE');",
  '  if(issues.length) rows.push({file,service:c.service,issues:issues.sort()});',
  '} console.log(JSON.stringify(rows));', '',
].join('\n');
const sales = [
  "import fs from 'node:fs/promises'; import path from 'node:path';",
  "const root=process.argv[2]; const tables=await Promise.all(['customers','products','orders','items','refunds'].map(async name=>JSON.parse(await fs.readFile(path.join(root,name+'.json'),'utf8'))));",
  'const [customers,products,orders,items,refunds]=tables;',
  'const regions=new Map(customers.map(row=>[row.id,row.region])),prices=new Map(products.map(row=>[row.sku,row.unitPriceCents]));',
  "const eligible=new Map(orders.filter(row=>row.status==='paid').map(row=>[row.id,regions.get(row.customerId)])), result=new Map();",
  'for(const region of eligible.values()) { const row=result.get(region)||{region,orderCount:0,grossCents:0,refundCents:0,netCents:0};row.orderCount++;result.set(region,row); }',
  'for(const item of items) { const region=eligible.get(item.orderId);if(region!==undefined) result.get(region).grossCents+=prices.get(item.sku)*item.quantity; }',
  "for(const refund of refunds) { const region=eligible.get(refund.orderId);if(region!==undefined&&refund.status==='approved')result.get(region).refundCents+=refund.amountCents; }",
  'console.log(JSON.stringify([...result.values()].map(row=>({...row,netCents:row.grossCents-row.refundCents})).sort((a,b)=>a.region<b.region?-1:a.region>b.region?1:0)));', '',
].join('\n');
const normalize = [
  'export function normalizeRows(rows) {',
  '  const accepted=[],errors=[],seen=new Set();',
  '  for(let index=0;index<rows.length;index++) {',
  '    const row=rows[index];',
  "    if(typeof row.id!=='string'||!row.id.trim()){errors.push({index,code:'id'});continue;}",
  "    const id=row.id.trim(),match=typeof row.amount==='string'?/^(0|[1-9][0-9]*)(?:\\.([0-9]{1,2}))?$/.exec(row.amount.trim()):null;",
  "    if(!match){errors.push({index,code:'amount'});continue;}",
  "    const value=BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));",
  "    if(value>BigInt(Number.MAX_SAFE_INTEGER)){errors.push({index,code:'amount'});continue;}",
  "    if(seen.has(id)){errors.push({index,code:'duplicate'});continue;}",
  '    seen.add(id);accepted.push({id,amountCents:Number(value)});',
  '  } return {accepted,errors};',
  '}', '',
].join('\n');

try {
  assert.deepEqual(cases.map(item=>item.complexity).sort(), ['high','high','low','low','medium','medium']);
  for (const item of cases) {
    const directory = path.join(root, item.id);
    const prepared = await prepareCase(item.id, directory);
    assert.equal(Boolean(prepared.skill), item.id === 'skill-import');
    await assert.rejects(prepareCase(item.id, directory), /必须为空/);
    const initial = await verifyCase(item.id, directory);
    assert.equal(initial.passed, false, item.id + ' 未完成夹具必须失败');
    assert.equal(initial.checks.find(check => check.name === '保护文件保持原样')?.passed, true);

    switch (item.id) {
      case 'rounding': await fs.writeFile(path.join(directory,'src/split-cents.mjs'),correctSplit,'utf8'); break;
      case 'cli': await fs.writeFile(path.join(directory,'cli.mjs'),cli,'utf8'); break;
      case 'log-diagnosis': {
        const file=path.join(directory,'src/order-discount.mjs');
        await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('const subtotal = line.unitPriceCents;', 'const subtotal = line.unitPriceCents * line.quantity;'),'utf8');
        const rows=(await fs.readFile(path.join(directory,'orders.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
        const mismatches=rows.flatMap((row,index)=>{
          if(row.event!=='order_priced')return [];
          const request=rows[index-1];
          const expected=request.lines.reduce((n:number,line:{unitPriceCents:number;quantity:number})=>n+line.unitPriceCents*line.quantity,0);
          return row.subtotalCents===expected?[]:[{orderId:row.orderId,line:index+1,expectedSubtotalCents:expected,actualSubtotalCents:row.subtotalCents,cause:'quantity_not_applied'}];
        });
        assert.equal(mismatches[0].orderId,'ORDER-0028');
        assert.equal(mismatches[0].line,58);
        await fs.writeFile(path.join(directory,'diagnosis.json'),JSON.stringify(mismatches[0]),'utf8');
        break;
      }
      case 'config-audit': await fs.writeFile(path.join(directory,'audit.mjs'),audit,'utf8'); break;
      case 'sales-report': await fs.writeFile(path.join(directory,'report.mjs'),sales,'utf8'); break;
      case 'skill-import': await fs.writeFile(path.join(directory,'normalize-import.mjs'),normalize,'utf8'); break;
    }
    const valid = await verifyCase(item.id, directory);
    assert.equal(valid.passed, true, item.id + ': ' + JSON.stringify(valid.checks));

    // 正确实现通过后再次植入错误，确认验收器没有只检查文件存在。
    const target = ({rounding:'src/split-cents.mjs',cli:'cli.mjs','log-diagnosis':'diagnosis.json','config-audit':'audit.mjs','sales-report':'report.mjs','skill-import':'normalize-import.mjs'} as Record<string,string>)[item.id];
    const correct=await fs.readFile(path.join(directory,target),'utf8');
    const wrong=item.id==='rounding'?'export const splitCents=(c,w)=>w.map(()=>0);\n':item.id==='log-diagnosis'?'{}':item.id==='skill-import'?'export const normalizeRows=()=>({accepted:[],errors:[]});\n':"console.log('[]');\n";
    await fs.writeFile(path.join(directory,target),wrong,'utf8');
    assert.equal((await verifyCase(item.id,directory)).passed,false,item.id+' 错误答案必须失败');
    await fs.writeFile(path.join(directory,target),correct,'utf8');
    await fs.appendFile(path.join(directory,'README.md'),'篡改','utf8');
    assert.equal((await verifyCase(item.id,directory)).checks.find(check=>check.name==='保护文件保持原样')?.passed,false);
    console.log(item.id + '：未完成失败、正确答案通过、错误答案失败、保护文件检查通过');
  }
  console.log('六类 token 基准夹具与独立验收器检查通过。');
} finally {
  assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(base));
  await fs.rm(root, { recursive: true });
}
