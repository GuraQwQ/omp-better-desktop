import fs from 'node:fs/promises';

const protocols = new Set(['openai-completions', 'openai-responses', 'anthropic-messages']);
const record = value => value && typeof value === 'object' && !Array.isArray(value);

async function readConfig(file) {
  let source;
  let json = false;
  try { source = await fs.readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw Error('Cannot read provider configuration.');
    try { source = await fs.readFile(file.replace(/\.ya?ml$/, '.json'), 'utf8'); json = true; }
    catch (error) { if (error.code === 'ENOENT') return { providers: {} }; throw Error('Cannot read provider configuration.'); }
  }
  let config;
  try { config = (json ? Bun.JSONC.parse(source) : Bun.YAML.parse(source)) ?? {}; }
  catch { throw Error('Provider configuration is not valid YAML or JSON.'); }
  if (!record(config) || (config.providers !== undefined && !record(config.providers))) throw Error('Invalid provider configuration structure.');
  return config;
}

function baseUrl(value, api) {
  let url;
  try { url = new URL(value); } catch { throw Error('Enter a valid provider URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Enter an HTTP or HTTPS provider URL.');
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/models$/, '');
  if (!url.pathname || url.pathname === '/') url.pathname = api === 'anthropic-messages' ? '' : '/v1';
  return url.toString().replace(/\/$/, '');
}

export function mergeProvider(config, input) {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id || !protocols.has(input.api)) throw Error('Enter a provider name and supported protocol.');
  const previous = config.providers?.[id] ?? {};
  if (!record(previous)) throw Error('Existing provider configuration is invalid.');
  const apiKey = input.apiKey?.trim() || previous.apiKey;
  if (typeof apiKey !== 'string' || !apiKey) throw Error('Enter an API key.');
  const ids = [...new Set((input.modelIds ?? []).filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
  if (!ids.length) throw Error('Enter at least one model ID.');
  const oldModels = Array.isArray(previous.models) ? previous.models : [];
  const models = ids.map(id => oldModels.find(model => model.id === id) ?? { id });
  return { ...config, providers: { ...config.providers, [id]: { ...previous, api: input.api, baseUrl: baseUrl(input.baseUrl, input.api), apiKey, models } } };
}

function summary(config) {
  return Object.entries(config.providers ?? {}).filter(([, value]) => record(value)).map(([id, provider]) => ({
    id, api: provider.api ?? 'openai-completions', baseUrl: provider.baseUrl ?? '', hasApiKey: !!provider.apiKey,
    models: (Array.isArray(provider.models) ? provider.models : []).filter(model => typeof model.id === 'string').map(model => ({ id: model.id, ...(typeof model.name === 'string' ? { name: model.name } : {}) })),
  }));
}

export function modelRows(body) {
  const values = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  const models = new Map();
  for (const value of values) {
    const id = typeof value === 'string' ? value : typeof value?.id === 'string' ? value.id : typeof value?.name === 'string' ? value.name.replace(/^models\//, '') : '';
    if (id) models.set(id, { id, ...(typeof value?.display_name === 'string' ? { name: value.display_name } : {}) });
  }
  return [...models.values()];
}

function endpoints(address) {
  const url = new URL(address);
  const prefix = url.pathname.replace(/\/$/, '');
  const candidates = [prefix.endsWith('/models') ? prefix : `${prefix}/models`];
  const root = prefix.replace(/\/models$/, '');
  candidates.push(root.endsWith('/v1') ? `${root.slice(0, -3)}/models` : `${root}/v1/models`);
  return [...new Set(candidates.map(candidate => new URL(candidate || '/models', url.origin).toString()))];
}

async function getPage(address, headers, signal) {
  let current = new URL(address);
  const origin = current.origin;
  for (let redirects = 0; redirects < 4; redirects++) {
    let response;
    try { response = await fetch(current, { headers, redirect: 'manual', signal }); }
    catch { throw Error('The provider model catalog could not be reached.'); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') ?? '', current);
      if (next.origin !== origin || next.username || next.password) throw Error('The model catalog redirected to another provider.');
      current = next; continue;
    }
    if ([404, 405, 501].includes(response.status)) return null;
    if (!response.ok) throw Error(`Model catalog HTTP ${response.status}.`);
    try { return { body: await response.json(), address: current.toString() }; }
    catch { throw Error('The model catalog did not return JSON.'); }
  }
  throw Error('The model catalog redirected too many times.');
}

async function discover(config, input) {
  if (!protocols.has(input.api)) throw Error('Choose a supported provider protocol.');
  const address = baseUrl(input.baseUrl, input.api);
  let key = input.apiKey?.trim() || config.providers?.[input.id]?.apiKey;
  if (typeof key !== 'string' || !key || key.startsWith('!')) throw Error('Enter an API key to fetch models.');
  key = process.env[key] ?? key;
  const headers = input.api === 'anthropic-messages' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${key}` };
  const signal = AbortSignal.timeout(10000);
  const supplied = new URL(input.baseUrl);
  supplied.search = ''; supplied.hash = '';
  const candidates = supplied.pathname.replace(/\/$/, '').endsWith('/models') ? [...new Set([supplied.toString(), ...endpoints(address)])] : endpoints(address);
  for (const candidate of candidates) {
    let page = await getPage(candidate, headers, signal);
    if (!page) continue;
    const models = new Map();
    const seen = new Set();
    for (let count = 0; page && count < 20; count++) {
      for (const model of modelRows(page.body)) models.set(model.id, model);
      const cursor = page.body?.has_more ? page.body.last_id : page.body?.next_cursor;
      if (typeof cursor !== 'string' || !cursor || seen.has(cursor)) break;
      seen.add(cursor);
      const next = new URL(page.address);
      next.searchParams.set(page.body.has_more ? 'after_id' : 'cursor', cursor);
      page = await getPage(next.toString(), headers, signal);
    }
    if (models.size) return { models: [...models.values()], endpoint: candidate };
  }
  return { models: [], endpoint: '' };
}

export async function run() {
  try {
    const request = JSON.parse(await Bun.stdin.text());
    const config = await readConfig(request.configPath);
    if (request.operation === 'discover') {
      process.stdout.write(JSON.stringify({ ok: true, value: await discover(config, request.provider) }));
      return;
    }
    const value = request.operation === 'save' ? mergeProvider(config, request.provider) : config;
    process.stdout.write(JSON.stringify({ ok: true, value: { providers: summary(value), ...(request.operation === 'save' ? { savedProvider: request.provider.id.trim(), content: Bun.YAML.stringify(value) } : {}) } }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Provider configuration failed.' }));
    process.exitCode = 1;
  }
}
