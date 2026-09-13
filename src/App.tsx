import './arcapp.css'
import { Routes, Route } from 'react-router-dom'
import ArcAppDashboard from './pages/arcapp/Dashboard'
import { isSupabaseConfigured } from './lib/supabaseClient'

function SetupRequired() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#05070d',
        color: '#eef1f8',
        fontFamily: 'monospace',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>⚠ Supabase isn&apos;t configured yet</h1>
        <p style={{ lineHeight: 1.6, color: '#8991b5' }}>
          <code>VITE_SUPABASE_URL</code> and/or <code>VITE_SUPABASE_ANON_KEY</code> are missing or
          invalid. This used to cause a blank screen with no explanation — now it shows this
          instead.
        </p>
        <ol style={{ lineHeight: 1.8, color: '#8991b5' }}>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> in the project root.
          </li>
          <li>
            Fill in real values from your Supabase project&apos;s Settings → API page.
          </li>
          <li>
            Restart <code>npm run dev</code> — Vite only reads <code>.env</code> on startup, not
            on hot-reload.
          </li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  return (
    <Routes>
      <Route path="/" element={<ArcAppDashboard />} />
      <Route path="*" element={<ArcAppDashboard />} />
    </Routes>
  )
}
