import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import SubmittalReviewerPanel from '../components/SubmittalReviewerPanel'

export default function SubmittalsPage() {
  const { canEdit } = useOutletContext<ShellContext>()
  return <SubmittalReviewerPanel canEdit={canEdit} />
}
