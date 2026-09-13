export default function KpiRow() {
  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="kpi-label">Milestones GO</div>
        <div className="kpi-value">
          4 <small>/ 6</small>
        </div>
        <div className="kpi-sub good">2 need attention this week</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Open to-dos</div>
        <div className="kpi-value">7</div>
        <div className="kpi-sub warn">2 due today</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Systems in commissioning</div>
        <div className="kpi-value">9</div>
        <div className="kpi-sub">3 disciplines active</div>
      </div>
      <div className="kpi clock">
        <div className="kpi-label">Next milestone</div>
        <div className="kpi-value">
          T&#8722;<span className="unit">02D</span>
        </div>
        <div className="kpi-sub bad">Domestic Water Booster — Turnover</div>
      </div>
    </div>
  )
}
