import { MilestoneList } from '../components/MilestonesPanel'
import { MILESTONES } from '../sampleData'

export default function MilestonesPage() {
  return (
    <section className="panel" id="milestones">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Milestones</h2>
          <span className="panel-count">{MILESTONES.length} tracked</span>
        </div>
      </div>
      <div className="panel-body">
        <MilestoneList milestones={MILESTONES} />
      </div>
    </section>
  )
}
