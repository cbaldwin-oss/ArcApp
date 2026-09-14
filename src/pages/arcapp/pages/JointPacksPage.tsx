import { useNavigate, useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import JointPackPhotosPanel from '../components/JointPackPhotosPanel'

export default function JointPacksPage() {
  const ctx = useOutletContext<ShellContext>()
  const navigate = useNavigate()
  return (
    <JointPackPhotosPanel
      folder={ctx.jointPackFolder}
      driveReady={ctx.driveReady}
      canEdit={ctx.canEdit}
      onLogPhotos={ctx.onLogJointPackPhotos}
      onGoToSettings={() => navigate('/settings')}
    />
  )
}
