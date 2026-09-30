import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// Guarantee the production app ALWAYS points to Render, regardless of local .env files
const API_URL = import.meta.env.PROD 
  ? 'https://attendance-system-4-blz0.onrender.com' 
  : (import.meta.env.VITE_API_URL || 'https://attendance-system-4-blz0.onrender.com');

axios.defaults.baseURL = API_URL;
console.log(`[Config] API Base URL set to: ${API_URL || 'Relative (Proxy)'}`);
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, info) { this.setState({ error, info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'20px',color:'red',background:'black',height:'100vh',width:'100vw',overflow:'auto'}}>
          <h1>App Crashed!</h1>
          <pre>{this.state.error.toString()}</pre>
          <pre>{this.state.info.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(e => console.error("SW Register Error:", e));
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
