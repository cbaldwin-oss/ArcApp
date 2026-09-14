import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import SettingsPanel from '../components/SettingsPanel'

export default function SettingsPage() {
  const ctx = useOutletContext<ShellContext>()
  return (
    <SettingsPanel
      jointPackFolder={ctx.jointPackFolder}
      checklistReadyStatuses={ctx.checklistReadyStatuses}
      issueReviewStatuses={ctx.issueReviewStatuses}
      canEdit={ctx.canEdit}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
    />
  )
}
