import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import SubmittalsManager from '../components/SubmittalsManager'

export default function SubmittalsPage() {
  const { canEdit } = useOutletContext<ShellContext>()
  return <SubmittalsManager canEdit={canEdit} />
}
