import type { GenUIConfiguration } from '../lib/genui-config';
import choiceControls from './choice-controls.css?inline';

export const GENUI_THEME_NAMES = ['surface', 'text', 'muted', 'border', 'accent', 'on-accent', 'success', 'warning', 'danger'] as const;
export function genUITheme(element: Element): Record<string, string> {
  const computed = getComputedStyle(element);
  return { ...Object.fromEntries(GENUI_THEME_NAMES.map(name => [name, computed.getPropertyValue(`--genui-${name}`).trim()])), scheme: computed.colorScheme, motion: document.documentElement.dataset.motion ?? 'rich', 'motion-fast': computed.getPropertyValue('--motion-fast').trim(), 'ease-enter': computed.getPropertyValue('--ease-enter').trim() };
}

export function genUIHtmlDocument(source: string, config: GenUIConfiguration, channel: string, state: Record<string, unknown>, theme: Record<string, string>, complete: boolean) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: http: data:; media-src https: http: data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  doc.querySelectorAll('meta[http-equiv],base,iframe,object,embed,link').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(element => { for (const attribute of [...element.attributes]) if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name); });
  if (!config.features.state || !complete) doc.querySelectorAll('input,select,textarea').forEach(element => element.setAttribute('disabled', ''));
  for (const script of doc.querySelectorAll('script')) {
    if (!config.features.scripts || !complete || script.src || script.type === 'module') script.remove();
    else script.setAttribute('nonce', nonce);
  }
  doc.head.prepend(csp);
  const styles = doc.createElement('style');
  styles.textContent = `:root{${Object.entries(theme).map(([name,value]) => `--genui-${name}:${value};`).join('')}color-scheme:var(--genui-scheme,light)}*{box-sizing:border-box}html,body{margin:0;min-height:1px;font:13px/1.6 system-ui;background:var(--genui-surface);color:var(--genui-text)}body{padding:16px;overflow-wrap:anywhere}input,textarea,select,button{font:inherit;color:inherit}input,textarea,select,button{background:var(--genui-surface);border:1px solid var(--genui-border);border-radius:6px;padding:8px}a{color:var(--genui-accent)}img,video,svg{max-width:100%}pre{overflow:auto}button{cursor:pointer;padding:8px 12px}`;
  doc.head.append(styles);
  doc.documentElement.dataset.motion = theme.motion ?? 'rich';
  styles.textContent += `:root{--surface:var(--genui-surface);--surface-raised:var(--genui-surface);--text:var(--genui-text);--line:var(--genui-border);--accent:var(--genui-accent);--on-accent:var(--genui-on-accent);--accent-soft:color-mix(in srgb,var(--genui-accent) 16%,transparent);--focus-ring:0 0 0 2px var(--genui-accent);--motion-fast:var(--genui-motion-fast,140ms);--ease-enter:var(--genui-ease-enter,cubic-bezier(.16,1,.3,1))}${choiceControls}`;
  const bridge = doc.createElement('script');
  bridge.setAttribute('nonce', nonce);
  bridge.textContent = `(() => {
    const channel=${JSON.stringify(channel)}, pending=new Map(); let state=${JSON.stringify(config.features.state ? state : {}).replaceAll('<', '\\u003c')}, sequence=0;
    const emit=(type,fields={})=>parent.postMessage({channel,type,...fields},'*');
    window.ompUI={getState:()=>structuredClone(state),setState:(value)=>{if(!${config.features.state})return; if(value&&typeof value==='object'&&!Array.isArray(value)){state={...state,...value};emit('state',{state});}},sendMessage:(text)=>{if(${config.features.actions}&&typeof text==='string')emit('action',{text,state});},call:(capability,args={})=>new Promise((resolve,reject)=>{if(!${config.features.hostCalls})return reject(Error('宿主能力已关闭'));const id=String(++sequence);const timeout=setTimeout(()=>{pending.delete(id);reject(Error('宿主调用超时，可重试'));},30000);pending.set(id,{resolve,reject,timeout});emit('call',{id,capability,args});})};
    addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!==channel)return;const message=event.data;if(message.type==='result'){const call=pending.get(message.id);if(call){clearTimeout(call.timeout);pending.delete(message.id);message.error?call.reject(Error(message.error)):call.resolve(message.value);}}else if(message.type==='theme'){for(const [name,value]of Object.entries(message.theme))document.documentElement.style.setProperty('--genui-'+name,value);document.documentElement.dataset.motion=message.theme.motion??'rich';}else if(message.type==='verify')verify();});
    addEventListener('error',event=>emit('error',{error:event.message}));addEventListener('unhandledrejection',event=>emit('error',{error:String(event.reason)}));
    function fields(){if(!${config.features.state})return;document.querySelectorAll('input[name],select[name],textarea[name]').forEach(field=>{if(Object.hasOwn(state,field.name)){if(field.type==='checkbox')field.checked=!!state[field.name];else if(field.type==='radio')field.checked=state[field.name]===field.value;else field.value=String(state[field.name]??'');}});}
    document.addEventListener('input',event=>{if(!${config.features.state})return;const field=event.target;if(field.name){state[field.name]=field.type==='checkbox'?field.checked:field.value;emit('state',{state});}});
    document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link){event.preventDefault();emit('open',{url:link.href});}});document.addEventListener('submit',event=>event.preventDefault());
    const resize=()=>emit('height',{height:document.body?.scrollHeight||120});
    function verify(){const issues=[];if(!document.body.textContent.trim()&&!document.querySelector('img,svg,canvas,input,button,video'))issues.push('界面为空');if(document.body.scrollWidth>innerWidth+2)issues.push('内容横向溢出');document.querySelectorAll('input,select,textarea').forEach(field=>{if(!field.checkValidity())issues.push((field.name||field.type)+' 的输入无效');});emit('verified',{issues});}
    addEventListener('DOMContentLoaded',()=>{fields();resize();new ResizeObserver(resize).observe(document.body);emit('ready');${config.features.verify && complete ? 'requestAnimationFrame(()=>requestAnimationFrame(verify));' : ''}});
  })();`;
  doc.head.insertBefore(bridge, csp.nextSibling);
  const html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  return { html, csp: csp.content, url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` };
}
