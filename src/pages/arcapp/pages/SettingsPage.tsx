import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import SettingsPanel from '../components/SettingsPanel'

export default function SettingsPage() {
  const ctx = useOutletContext<ShellContext>()
  return (
    <SettingsPanel
      jointPackFolder={ctx.jointPackFolder}
      jointPackEnabled={ctx.jointPackEnabled}
      jointPackScriptUrl={ctx.jointPackScriptUrl}
      netaTrackerEnabled={ctx.netaTrackerEnabled}
      netaTrackerScriptUrl={ctx.netaTrackerScriptUrl}
      assetAttributesEnabled={ctx.assetAttributesEnabled}
      checklistReadyStatuses={ctx.checklistReadyStatuses}
      issueReviewStatuses={ctx.issueReviewStatuses}
      issueCreatorCompanyFilter={ctx.issueCreatorCompanyFilter}
      submittalExemptAssets={ctx.submittalExemptAssets}
      checklistTodoEnabled={ctx.checklistTodoEnabled}
      issueTodoEnabled={ctx.issueTodoEnabled}
      netaSubmissionsTodoEnabled={ctx.netaSubmissionsTodoEnabled}
      netaReturnedTodoEnabled={ctx.netaReturnedTodoEnabled}
      checklistDefaultAssignee={ctx.checklistDefaultAssignee}
      issueDefaultAssignee={ctx.issueDefaultAssignee}
      netaSubmissionsDefaultAssignee={ctx.netaSubmissionsDefaultAssignee}
      netaReturnedDefaultAssignee={ctx.netaReturnedDefaultAssignee}
      teams={ctx.teams}
      cxAlloyLinkBaseDetected={ctx.cxAlloyLinkBaseDetected}
      cxalloyLinkBaseOverride={ctx.cxalloyLinkBaseOverride}
      canEdit={ctx.canEdit}
      isAdmin={ctx.isAdmin}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
      onSaveDefaultAssignee={ctx.onSaveDefaultAssignee}
    />
  )
}
