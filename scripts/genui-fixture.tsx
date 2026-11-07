import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GenerativeUI from '../src/components/GenerativeUI';
import GenerativeUISettings from '../src/panels/GenerativeUISettings';
import { normalizeGenUIConfiguration } from '../src/lib/genui-config';
import '../src/tokens.css';
import '../src/styles.css';

const source = '$name = "初始"\nfield = Input("name", "姓名", $name)\nsubmit = Button("提交", @ToAssistant("保存表单"))\nroot = Col([Title("项目确认", 2), field, submit, Table(["文件", "状态"], [["界面.tsx", "待确认"]])])';
const html = '<h2>HTML 表单</h2><label>备注<input name="note" aria-label="备注"></label><fieldset><legend>选择控件</legend><label><input type="checkbox" name="confirmed">确认项目</label><label><input type="radio" name="variant" value="light">轻量方案</label><label><input type="radio" name="variant" value="full">完整方案</label></fieldset><button id="send">回传 HTML</button><script>document.getElementById("send").addEventListener("click",()=>ompUI.sendMessage("提交备注"));</script>';
function Fixture() {
  const [config, setConfig] = useState(() => normalizeGenUIConfiguration({ enabled: true, features: { diagnostics: true, repair: true, verify: true } }));
  const [visible, setVisible] = useState(true);
  const [value, setValue] = useState(source), [message, setMessage] = useState(''), [streaming,setStreaming] = useState(false);
  return <main style={{ padding:24,maxWidth:1000,margin:'auto',height:'100%',overflow:'auto' }}><h1>生成式 UI 交互验证</h1><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary-button" onClick={() => setVisible(value => !value)}>{visible ? '隐藏界面' : '显示界面'}</button><button className="secondary-button" onClick={() => setValue('root = Unavailable("错误")')}>替换错误源码</button><button className="secondary-button" onClick={() => setValue(source.replace('项目确认','已修复界面'))}>应用修复源码</button><button className="secondary-button" onClick={() => setStreaming(value => !value)}>{streaming ? '完成界面生成' : '进入生成状态'}</button><button className="secondary-button" onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; }}>切换主题</button></div>{visible && <><GenerativeUI source={value} id="fixture-openui" cwd="D:/omp-better-desktop" language="zh" configuration={config} onSend={setMessage} isStreaming={streaming} /><GenerativeUI source={html} kind="html" id="fixture-html" cwd="D:/omp-better-desktop" language="zh" configuration={config} onSend={setMessage} isStreaming={streaming} /></>}<pre role="status" id="message">{message}</pre><GenerativeUISettings language="zh" configuration={config} onChange={setConfig} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
