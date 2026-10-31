import { useState } from 'react';
import { Bot } from 'lucide-react';
import './agent-source-icon.css';

const brands = ['antigravity', 'gemini', 'claude', 'codex', 'trae', 'zcode', 'ccswitch'];
export default function AgentSourceIcon({ source = '', path = '' }: { source?: string; path?: string }) {
  const value = `${source} ${path}`.toLowerCase().replace(/cc[- ]switch/g, 'ccswitch');
  const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
  const brand = /\/(?:\.gemini\/config|\.agents)\/mcp_config\.json$/.test(normalizedPath) ? 'antigravity' : brands.find(brand => value.includes(brand));
  const [failed, setFailed] = useState('');
  return brand && failed !== brand
    ? <img className="agent-source-icon" src={`/agent-icons/${brand}.png`} width={20} height={20} alt="" aria-hidden="true" decoding="async" onError={() => setFailed(brand)} />
    : <Bot className="agent-source-icon agent-source-fallback" size={20} aria-hidden="true" />;
}
