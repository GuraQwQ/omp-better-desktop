import type { Bootstrap, Preferences } from '../lib/types';
import type { Copy } from '../lib/i18n';
import { displayPath } from '../lib/display-path';
import { normalizeMotion } from '../lib/motion';
import { optionalFeatures } from '../lib/desktop-preferences';
import Select from '../components/Select';
type Props = { bootstrap: Bootstrap; t: Copy; change: (patch: Partial<Preferences>) => void };

export function GeneralPreferences({ bootstrap, t, change }: Props) {
  const preferences = bootstrap.preferences; const zh = preferences.language === 'zh';
  const toggles = [
    { key: 'showTurnNumber', label: t.showTurnNumber, hint: t.showTurnNumberHint },
    { key: 'notifyOnDone', label: t.notifyOnDone, hint: t.notifyOnDoneHint },
    { key: 'asyncQuestions', label: zh ? '异步提问' : 'Asynchronous questions', hint: zh ? '模型提问后继续处理任务，新连接生效。' : 'Let the model continue working after asking. Applies to new connections.' },
  ] as const;
  return <><h2>{zh ? '通用' : 'General'}</h2>{toggles.map(toggle => <div className="setting-row" key={toggle.key}><div><strong id={`general-${toggle.key}`}>{toggle.label}</strong><small>{toggle.hint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby={`general-${toggle.key}`} checked={preferences[toggle.key] !== false} onChange={event => change({ [toggle.key]: event.target.checked })} /></div>)}<h3>{zh ? '工作区功能' : 'Workspace features'}</h3>{Object.entries(optionalFeatures).map(([key, feature]) => <div className="setting-row" key={key}><div><strong id={`feature-${key}`}>{feature.label}</strong><small>{feature.hint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby={`feature-${key}`} checked={preferences.features?.[key as keyof typeof optionalFeatures] === true} onChange={event => change({ features: { [key]: event.target.checked } })} /></div>)}<div className="settings-note"><strong>{t.dataRoot}</strong><code>{bootstrap.dataRoot ? displayPath(bootstrap.dataRoot) : t.nativeOnly}</code></div></>;
}
export function AppearancePreferences({ bootstrap, t, change }: Props) {
  const preferences = bootstrap.preferences;
  return <><h2>{t.appearance}</h2><div className="setting-row"><strong>{t.language}</strong><Select label={t.language} value={preferences.language} onChange={language => change({ language: language as Preferences['language'] })} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]} /></div><div className="setting-row"><strong>{t.theme}</strong><Select label={t.theme} value={preferences.theme} onChange={theme => change({ theme: theme as Preferences['theme'] })} options={[{ value: 'system', label: t.system }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]} /></div><div className="setting-row"><div><strong>{t.animation}</strong><small>{t.motionHints[normalizeMotion(preferences.motion)]}</small></div><Select label={t.animation} value={normalizeMotion(preferences.motion)} onChange={motion => change({ motion: motion as Preferences['motion'] })} options={Object.entries(t.motionLevels).map(([value, label]) => ({ value, label }))} /></div></>;
}
