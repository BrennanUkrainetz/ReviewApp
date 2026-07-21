import './styles/index.css';
import { mountApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('Aerie: #app root element is missing from index.html');

mountApp(root);
