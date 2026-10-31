import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Json, Language } from '../lib/types';

export default function ProviderAccounts({ sessionId, language, t, onError }: { sessionId: string; language: Language; t: Copy; onError: (error: unknown) => void }) {
  const zh = language === 'zh';
  const [providers, setProviders] = useState<Json[]>([]);
  const [accounts, setAccounts] = useState<Record<string, Json[]>>({});
  const [expanded, setExpanded] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const revision = useRef(0);
  const load = async () => {
    const current = ++revision.current;
    setLoading(true); setError('');
    try {
      const result = await rpc(sessionId, 'get_login_providers');
      if (current === revision.current) setProviders(result.providers);
    } catch (error) { if (current === revision.current) setError(String(error)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  useEffect(() => { setAccounts({}); setExpanded(''); void load(); return () => { revision.current++; }; }, [sessionId]);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); } catch (error) { setError(String(error)); onError(error); } finally { setBusy(false); }
  };
  const readAccounts = async (providerId: string) => {
    const current = revision.current;
    const result = await rpc(sessionId, 'get_logout_accounts', { providerId });
    if (current === revision.current) setAccounts(old => ({ ...old, [providerId]: result.accounts }));
  };
  return <section>
    <h3>{zh ? '提供商账户' : 'Provider accounts'}</h3>
    <input className="settings-search" type="search" aria-label={zh ? '搜索提供商账户' : 'Search providers'} placeholder={zh ? '搜索提供商' : 'Search providers'} value={query} onChange={event => setQuery(event.target.value)} />
    {error && <div role="alert"><p className="settings-error">{error}</p><button className="quiet-button" disabled={busy} onClick={() => void load()}>{t.refresh}</button></div>}
    {loading ? <p role="status">{t.loading}</p> : providers.filter(provider => `${provider.id} ${provider.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(provider => <div className="setting-editor" key={provider.id}>
      <div className="setting-row"><div><strong>{provider.name}</strong><small>{provider.authenticated ? zh ? '已连接' : 'Connected' : zh ? '尚未登录' : 'Not signed in'}</small></div><button className="quiet-button" disabled={busy} onClick={() => void act(async () => { await rpc(sessionId, 'login', { providerId: provider.id }); await load(); if (expanded === provider.id) await readAccounts(provider.id); })}>{t.login}</button>{provider.authenticated && <button className="quiet-button" disabled={busy} aria-expanded={expanded === provider.id} onClick={() => { if (expanded === provider.id) setExpanded(''); else { setExpanded(provider.id); void act(() => readAccounts(provider.id)); } }}>{zh ? '账户' : 'Accounts'}</button>}</div>
      {expanded === provider.id && (accounts[provider.id] ?? []).map(account => {
        const key = `${provider.id}:${account.credentialId}`;
        return <div className="setting-row" key={key}><div><strong>{account.label}</strong><small>{account.detail}{account.active ? zh ? ' · 当前使用' : ' · Active' : ''}</small></div>{confirm === key ? <><button className="quiet-button" disabled={busy} onClick={() => void act(async () => { await rpc(sessionId, 'logout', { providerId: provider.id, credentialId: account.credentialId }); setConfirm(''); await load(); await readAccounts(provider.id); })}>{zh ? '确认退出' : 'Confirm sign out'}</button><button className="quiet-button" disabled={busy} onClick={() => setConfirm('')}>{t.cancel}</button></> : <button className="quiet-button" disabled={busy} onClick={() => setConfirm(key)}>{zh ? '退出账户' : 'Sign out'}</button>}</div>;
      })}
    </div>)}
  </section>;
}
