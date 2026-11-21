import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { Bootstrap, ColorPalette, CustomAccent, Preferences } from '../lib/types';
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
  return <><h2>{zh ? '通用' : 'General'}</h2>{toggles.map(toggle => <div className="setting-row" key={toggle.key}><div><strong id={`general-${toggle.key}`}>{toggle.label}</strong><small>{toggle.hint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby={`general-${toggle.key}`} checked={preferences[toggle.key] !== false} onChange={event => change({ [toggle.key]: event.target.checked })} /></div>)}<h3>{zh ? '工作区功能' : 'Workspace features'}</h3>{Object.entries(optionalFeatures).map(([key, feature]) => <div className="setting-row" key={key}><div><strong id={`feature-${key}`}>{zh ? feature.label : feature.enLabel}</strong><small>{zh ? feature.hint : feature.enHint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby={`feature-${key}`} checked={preferences.features?.[key as keyof typeof optionalFeatures] === true} onChange={event => change({ features: { [key]: event.target.checked } })} /></div>)}<div className="settings-note"><strong>{t.dataRoot}</strong><code>{bootstrap.dataRoot ? displayPath(bootstrap.dataRoot) : t.nativeOnly}</code></div></>;
}
const paletteSamples = [
  { id: 'obsidian', label: 'Obsidian Studio', en: 'Obsidian Studio', light: ['#f5f5f7', '#0062c4'], dark: ['#1c1c1e', '#4da6ff'] },
  { id: 'classic', label: '旧版配色', en: 'Classic', light: ['#fcfcfb', '#42664b'], dark: ['#151714', '#a7c698'] },
  { id: 'claude', label: 'Claude', en: 'Claude', light: ['#faf9f5', '#98432e'], dark: ['#141413', '#d97757'] },
  { id: 'omp', label: 'OMP 官方', en: 'OMP', light: ['#f8f8f8', '#3b6768'], dark: ['#151820', '#00b4ff'] },
  { id: 'custom', label: '自定义', en: 'Custom', light: ['#f5f5f7', '#0062c4'], dark: ['#1c1c1e', '#4da6ff'] },
] as const satisfies ReadonlyArray<{ id: ColorPalette; label: string; en: string; light: readonly [string, string]; dark: readonly [string, string] }>;
const defaultAccent: CustomAccent = { light: '#0062c4', dark: '#4da6ff' };

export function AppearancePreferences({ bootstrap, t, change }: Props) {
  const { preferences } = bootstrap;
  const zh = preferences.language === 'zh';
  const active = preferences.palette ?? 'obsidian';
  const saved = preferences.customAccent ?? defaultAccent;
  const [accent, setAccent] = useState(saved);
  const changed = accent.light !== saved.light || accent.dark !== saved.dark;
  return <>
    <h2>{t.appearance}</h2>
    <div className="setting-row"><strong>{t.language}</strong><Select label={t.language} value={preferences.language} onChange={language => change({ language: language as Preferences['language'] })} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]} /></div>
    <div className="setting-row"><strong>{t.theme}</strong><Select label={t.theme} value={preferences.theme} onChange={theme => change({ theme: theme as Preferences['theme'] })} options={[{ value: 'light', label: t.light }, { value: 'dark', label: t.dark }, { value: 'system', label: t.system }]} /></div>
    <fieldset className="palette-picker">
      <legend><strong>{zh ? '配色方案' : 'Color palette'}</strong></legend>
      <div className="palette-choices">{paletteSamples.map(palette => <button key={palette.id} type="button" className="palette-choice" data-choice={palette.id} aria-pressed={active === palette.id} onClick={() => { if (active !== palette.id) change({ palette: palette.id }); }}>
        <span className="palette-preview" aria-hidden="true">
          {(['light', 'dark'] as const).map(mode => <i key={mode} style={{ '--sample-surface': palette[mode][0], '--sample-accent': palette.id === 'custom' ? saved[mode] : palette[mode][1] } as CSSProperties} />)}
        </span>
        <span>{zh ? palette.label : palette.en}{active === palette.id && <Check size={12} aria-hidden="true" />}</span>
      </button>)}</div>
      {active === 'custom' && <div className="palette-custom">
        <p>{zh ? '分别设置浅色和深色的强调色。应用会自动调整对比度。' : 'Choose accents for light and dark. Contrast adjusts automatically.'}</p>
        <div className="palette-custom-actions">
          {(['light', 'dark'] as const).map(mode => <label key={mode}>{mode === 'light' ? t.light : t.dark}<input type="color" value={accent[mode]} onChange={event => setAccent({ ...accent, [mode]: event.target.value })} /></label>)}
          <button type="button" className="secondary-button" disabled={!changed} onClick={() => change({ customAccent: accent })}>{zh ? '保存配色' : 'Save colors'}</button>
        </div>
      </div>}
    </fieldset>
    <div className="setting-row"><div><strong>{t.animation}</strong><small>{t.motionHints[normalizeMotion(preferences.motion)]}</small></div><Select label={t.animation} value={normalizeMotion(preferences.motion)} onChange={motion => change({ motion: motion as Preferences['motion'] })} options={Object.entries(t.motionLevels).map(([value, label]) => ({ value, label }))} /></div>
  </>;
}
