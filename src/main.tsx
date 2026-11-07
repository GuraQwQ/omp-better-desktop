import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TaskCard from './components/TaskCard';
import './styles.css';

const card = new URLSearchParams(location.search).get('card');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{card ? <TaskCard id={card} /> : <App />}</React.StrictMode>);
