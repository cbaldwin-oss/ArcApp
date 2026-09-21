import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import AssetAttributesManager from '../components/AssetAttributesManager'

export default function AssetAttributesPage() {
  const { canEdit } = useOutletContext<ShellContext>()
  return <AssetAttributesManager canEdit={canEdit} />
}
