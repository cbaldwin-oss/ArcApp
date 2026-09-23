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
      submittalExemptAssets={ctx.submittalExemptAssets}
      checklistTodoEnabled={ctx.checklistTodoEnabled}
      issueTodoEnabled={ctx.issueTodoEnabled}
      checklistOpenStatuses={ctx.checklistOpenStatuses}
      issueOpenStatuses={ctx.issueOpenStatuses}
      netaSubmissionsTodoEnabled={ctx.netaSubmissionsTodoEnabled}
      netaReturnedTodoEnabled={ctx.netaReturnedTodoEnabled}
      canEdit={ctx.canEdit}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
    />
  )
}
