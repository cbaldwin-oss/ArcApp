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
      netaSubmissionsTodoEnabled={ctx.netaSubmissionsTodoEnabled}
      netaReturnedTodoEnabled={ctx.netaReturnedTodoEnabled}
      cxAlloyLinkBaseDetected={ctx.cxAlloyLinkBaseDetected}
      cxalloyLinkBaseOverride={ctx.cxalloyLinkBaseOverride}
      canEdit={ctx.canEdit}
      isAdmin={ctx.isAdmin}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
    />
  )
}
