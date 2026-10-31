import fs from 'node:fs/promises';

const protocols = new Set(['openai-completions', 'openai-responses', 'anthropic-messages']);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const providerFields = ['auth', 'authHeader', 'headers', 'discovery', 'disableStrictTools', 'transport', 'compat'];
const modelFields = ['name', 'api', 'baseUrl', 'contextWindow', 'maxContextWindow', 'maxTokens', 'reasoning', 'input', 'supportsTools', 'cost', 'headers', 'compat', 'omitMaxOutputTokens', 'preferWebsockets', 'compactionModel'];
const discoveryTypes = new Set(['ollama', 'llama.cpp', 'lm-studio', 'openai-models-list', 'proxy', 'litellm', 'apple-foundation-models']);

function strings(value, label) {
  if (!record(value) || Object.values(value).some(item => typeof item !== 'string')) throw Error(`${label} must contain string values.`);
}

function applyFields(previous, changes, fields) {
  const result = { ...previous };
  if (changes !== undefined && !record(changes)) throw Error('Advanced settings must be an object.');
  for (const field of fields) {
    if (!changes || !Object.hasOwn(changes, field)) continue;
    if (changes[field] === null) delete result[field];
    else result[field] = changes[field];
  }
  return result;
}

function validateProvider(provider) {
  if (provider.auth !== undefined && !['apiKey', 'none', 'oauth'].includes(provider.auth)) throw Error('Choose a supported authentication mode.');
  for (const key of ['authHeader', 'disableStrictTools']) if (provider[key] !== undefined && typeof provider[key] !== 'boolean') throw Error(`${key} must be a boolean.`);
  if (provider.headers !== undefined) strings(provider.headers, 'Headers');
  if (provider.compat !== undefined && !record(provider.compat)) throw Error('Compatibility settings must be an object.');
  if (provider.transport !== undefined && provider.transport !== 'pi-native') throw Error('Choose a supported transport.');
  if (provider.discovery !== undefined) {
    const discovery = provider.discovery;
    if (!record(discovery) || !discoveryTypes.has(discovery.type)) throw Error('Choose a supported discovery type.');
    if (discovery.timeoutMs !== undefined && (!Number.isFinite(discovery.timeoutMs) || discovery.timeoutMs <= 0)) throw Error('Discovery timeout must be a positive number.');
    if (discovery.injectV1 !== undefined && (typeof discovery.injectV1 !== 'boolean' || discovery.type !== 'openai-models-list')) throw Error('injectV1 is only supported by OpenAI model-list discovery.');
    if (discovery.advertisedReasoning !== undefined && (typeof discovery.advertisedReasoning !== 'boolean' || !['openai-models-list', 'lm-studio', 'proxy'].includes(discovery.type))) throw Error('Advertised reasoning is not supported by this discovery type.');
  }
}

function validateModel(model) {
  for (const key of ['name', 'compactionModel']) if (model[key] !== undefined && (typeof model[key] !== 'string' || !model[key].trim())) throw Error(`${model.id}: ${key} must be non-empty text.`);
  if (model.api !== undefined && (typeof model.api !== 'string' || !model.api.trim())) throw Error(`${model.id}: choose a supported protocol.`);
  for (const key of ['contextWindow', 'maxContextWindow', 'maxTokens']) if (model[key] !== undefined && (!Number.isSafeInteger(model[key]) || model[key] <= 0)) throw Error(`${model.id}: ${key} must be a positive integer.`);
  if (model.maxContextWindow !== undefined && model.contextWindow !== undefined && model.maxContextWindow < model.contextWindow) throw Error(`${model.id}: extended context must be at least the context length.`);
  for (const key of ['reasoning', 'supportsTools', 'omitMaxOutputTokens', 'preferWebsockets']) if (model[key] !== undefined && typeof model[key] !== 'boolean') throw Error(`${model.id}: ${key} must be a boolean.`);
  if (model.input !== undefined && (!Array.isArray(model.input) || !model.input.length || model.input.some(value => !['text', 'image'].includes(value)))) throw Error(`${model.id}: choose text or image input.`);
  if (model.cost !== undefined && (!record(model.cost) || ['input', 'output', 'cacheRead', 'cacheWrite'].some(key => !Number.isFinite(model.cost[key]) || model.cost[key] < 0))) throw Error(`${model.id}: enter all four non-negative prices, or use the provider defaults.`);
  if (model.headers !== undefined) strings(model.headers, `${model.id} headers`);
  if (model.compat !== undefined && !record(model.compat)) throw Error(`${model.id}: compatibility settings must be an object.`);
  if (model.baseUrl !== undefined) model.baseUrl = baseUrl(model.baseUrl, model.api);
}

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
  const provider = applyFields(previous, input.options, providerFields);
  validateProvider(provider);
  const apiKey = input.apiKey?.trim() || previous.apiKey;
  if (!['none', 'oauth'].includes(provider.auth) && (typeof apiKey !== 'string' || !apiKey)) throw Error('Enter an API key.');
  const ids = [...new Set((input.modelIds ?? []).filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
  if (!ids.length && !provider.discovery) throw Error('Enter at least one model ID or enable model discovery.');
  const oldModels = Array.isArray(previous.models) ? previous.models : [];
  if (input.modelSettings !== undefined && !record(input.modelSettings)) throw Error('Model settings must be an object.');
  const models = ids.map(id => {
    const model = applyFields(oldModels.find(model => model.id === id) ?? { id }, input.modelSettings?.[id], modelFields);
    validateModel(model);
    return model;
  });
  const value = { ...provider, api: input.api, baseUrl: baseUrl(input.baseUrl, input.api), models };
  if (apiKey) value.apiKey = apiKey;
  return { ...config, providers: { ...config.providers, [id]: value } };
}

export function deleteProvider(config, input) {
  if (typeof input?.id !== 'string' || !input.id.trim()) throw Error('Choose a provider to remove.');
  const providers = { ...config.providers };
  delete providers[input.id.trim()];
  return { ...config, providers };
}

export function summary(config) {
  return Object.entries(config.providers ?? {}).filter(([, value]) => record(value)).map(([id, provider]) => ({
    id, api: provider.api ?? 'openai-completions', baseUrl: provider.baseUrl ?? '', hasApiKey: !!provider.apiKey,
    options: Object.fromEntries(providerFields.filter(key => Object.hasOwn(provider, key)).map(key => [key, provider[key]])),
    models: (Array.isArray(provider.models) ? provider.models : []).filter(model => typeof model.id === 'string').map(model => ({ id: model.id, ...Object.fromEntries(modelFields.filter(key => Object.hasOwn(model, key)).map(key => [key, model[key]])) })),
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
  const options = applyFields(config.providers?.[input.id] ?? {}, input.options, providerFields);
  validateProvider(options);
  if ((typeof key !== 'string' || !key || key.startsWith('!')) && !['none', 'oauth'].includes(options.auth)) throw Error('Enter an API key to fetch models.');
  key = options.auth !== 'none' && typeof key === 'string' ? process.env[key] ?? key : '';
  const headers = new Headers(options.headers);
  if (key && input.api === 'anthropic-messages') { if (!headers.has('x-api-key')) headers.set('x-api-key', key); if (!headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01'); }
  else if (key && !headers.has('authorization')) headers.set('authorization', `Bearer ${key}`);
  const signal = AbortSignal.timeout(Math.max(1, Math.floor(options.discovery?.timeoutMs ?? 10000)));
  const supplied = new URL(input.baseUrl);
  supplied.search = ''; supplied.hash = '';
  const paths = options.discovery?.injectV1 === false ? [`${address}/models`] : endpoints(address);
  const candidates = supplied.pathname.replace(/\/$/, '').endsWith('/models') ? [...new Set([supplied.toString(), ...paths])] : paths;
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
    if (!['list', 'save', 'delete'].includes(request.operation)) throw Error('Unknown provider configuration operation.');
    const value = request.operation === 'save' ? mergeProvider(config, request.provider) : request.operation === 'delete' ? deleteProvider(config, request.provider) : config;
    process.stdout.write(JSON.stringify({ ok: true, value: { providers: summary(value), ...(request.operation !== 'list' ? { savedProvider: request.operation === 'save' ? request.provider.id.trim() : undefined, content: Bun.YAML.stringify(value) } : {}) } }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Provider configuration failed.' }));
    process.exitCode = 1;
  }
}
