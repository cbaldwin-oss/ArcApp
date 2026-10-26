import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import JointPackPhotosPanel from '../components/JointPackPhotosPanel'
import CapabilityNotice from '../components/CapabilityNotice'

export default function JointPacksPage() {
  const ctx = useOutletContext<ShellContext>()
  if (!ctx.jointPackEnabled) {
    return (
      <CapabilityNotice
        feature="Joint Packs"
        id="jointpacks"
        reason="This project doesn't have Joint Pack Photos set up yet."
      />
    )
  }
  return <JointPackPhotosPanel />
}
