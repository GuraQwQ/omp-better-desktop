import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TaskCard from './components/TaskCard';
import './styles.css';

// 桌面开发窗口也使用本地诊断，关闭 OpenUI 云端调试面板的自动挂载。
Reflect.set(globalThis, Symbol.for('openui.devtools.autoMount'), true);

const card = new URLSearchParams(location.search).get('card');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{card ? <TaskCard id={card} /> : <App />}</React.StrictMode>);
