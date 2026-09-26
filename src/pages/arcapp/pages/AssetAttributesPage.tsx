import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import AssetAttributesManager from '../components/AssetAttributesManager'

export default function AssetAttributesPage() {
  const { canEdit, assetAttributesEnabled } = useOutletContext<ShellContext>()
  return <AssetAttributesManager canEdit={canEdit} available={assetAttributesEnabled} />
}
