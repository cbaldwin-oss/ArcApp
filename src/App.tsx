import './arcapp.css'
import { Routes, Route } from 'react-router-dom'
import ArcAppDashboard from './pages/arcapp/Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ArcAppDashboard />} />
      <Route path="*" element={<ArcAppDashboard />} />
    </Routes>
  )
}
