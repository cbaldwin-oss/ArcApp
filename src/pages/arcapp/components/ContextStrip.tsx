import { CURRENT_PROJECT, projectLabel } from '../../../lib/project'

export default function ContextStrip() {
  return (
    <div className="context-strip">
      <span>
        PROJECT <b>{projectLabel(CURRENT_PROJECT)}</b>
      </span>
      <span className="divider">/</span>
      <span>
        ROLE <b>Commissioning Lead</b>
      </span>
      <span className="divider">/</span>
      <span>
        MISSION DAY <b>T+118</b>
      </span>
      <span className="divider">/</span>
      <span>
        OPEN SYSTEMS <b>9</b>
      </span>
    </div>
  )
}
