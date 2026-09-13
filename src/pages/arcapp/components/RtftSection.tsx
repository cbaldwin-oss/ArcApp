import { useState, useEffect } from 'react'
import type { ScheduleRow } from '../types'

export type RtftPayload = {
  date: string
  equipment: string
  equipmentType: string
  ofe: boolean
  inspector: string
  opsTeamPresent: string
  cxaPresent: string
  gcPresent: string
  issuesFound: string
  correctedImmediately: string
  issueDescription: string
  enteredBIM: string
  bimIssueNumber: string
  l2Pass: string
}

type Props = {
  row: ScheduleRow
  authUser: string | null
  selectedDate: string
  onSubmit: (payload: RtftPayload) => Promise<void>
}

const YN = ['', 'Yes', 'No']

export default function RtftSection({ row, authUser, selectedDate, onSubmit }: Props) {
  const [equipmentType, setEquipmentType] = useState('')
  const [inspector, setInspector] = useState(authUser || '')
  const [ofe, setOfe] = useState(false)
  const [opsPresent, setOpsPresent] = useState('')
  const [cxaPresent, setCxaPresent] = useState('')
  const [gcPresent, setGcPresent] = useState('')
  const [issuesFound, setIssuesFound] = useState('')
  const [corrected, setCorrected] = useState('')
  const [issueDesc, setIssueDesc] = useState('')
  const [enteredBim, setEnteredBim] = useState('')
  const [bimNumber, setBimNumber] = useState('')
  const [l2Pass, setL2Pass] = useState('')
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  // Reset when the activity row changes.
  useEffect(() => {
    setEquipmentType('')
    setInspector(authUser || '')
    setOfe(false)
    setOpsPresent('')
    setCxaPresent('')
    setGcPresent('')
    setIssuesFound('')
    setCorrected('')
    setIssueDesc('')
    setEnteredBim('')
    setBimNumber('')
    setL2Pass('')
    setMsg({ text: '', cls: 'q-hint' })
  }, [row.id, authUser])

  const disabled = !authUser || busy
  const showIssueFields = issuesFound === 'Yes'
  const showBimNumber = showIssueFields && enteredBim === 'Yes'

  async function submit() {
    if (!authUser) return
    if (!issuesFound || !l2Pass) {
      setMsg({ text: 'Answer "Were issues found?" and "L2 pass?" before submitting.', cls: 'q-hint err' })
      return
    }
    const payload: RtftPayload = {
      date: selectedDate,
      equipment: row.asset || '',
      equipmentType: equipmentType.trim(),
      ofe,
      inspector: inspector.trim(),
      opsTeamPresent: opsPresent,
      cxaPresent,
      gcPresent,
      issuesFound,
      correctedImmediately: issuesFound === 'Yes' ? corrected : '',
      issueDescription: issuesFound === 'Yes' ? issueDesc.trim() : '',
      enteredBIM: issuesFound === 'Yes' ? enteredBim : '',
      bimIssueNumber: issuesFound === 'Yes' && enteredBim === 'Yes' ? bimNumber.trim() : '',
      l2Pass,
    }

    setBusy(true)
    setMsg({ text: 'Saving RTFT entry…', cls: 'q-hint' })
    try {
      await onSubmit(payload)
      setMsg({ text: `Saved RTFT entry for "${row.asset}".`, cls: 'q-hint ok' })
      setEquipmentType('')
      setOfe(false)
      setOpsPresent('')
      setCxaPresent('')
      setGcPresent('')
      setIssuesFound('')
      setCorrected('')
      setIssueDesc('')
      setEnteredBim('')
      setBimNumber('')
      setL2Pass('')
    } catch (err) {
      setMsg({ text: 'Failed to submit: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  const statusText = !authUser
    ? 'Sign in to submit an RTFT entry.'
    : msg.text || `Signed in as ${authUser}.`

  return (
    <div className="q-block">
      <label className="q-label">Right the First Time (RTFT)</label>

      <div className="form-field">
        <label>Equipment (auto-filled from this activity)</label>
        <input type="text" value={row.asset || ''} disabled />
      </div>

      <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="form-field">
          <label>Equipment type</label>
          <input
            type="text"
            placeholder="e.g. AHU, Switchgear"
            value={equipmentType}
            disabled={disabled}
            onChange={(e) => setEquipmentType(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>Inspector</label>
          <input type="text" value={inspector} disabled={disabled} onChange={(e) => setInspector(e.target.value)} />
        </div>
      </div>

      <label className="rtft-checkbox-label">
        <input type="checkbox" checked={ofe} disabled={disabled} onChange={(e) => setOfe(e.target.checked)} />
        Owner-Furnished Equipment (OFE)?
      </label>

      <div className="seal-row3">
        <div className="form-field">
          <label>Ops team present</label>
          <select value={opsPresent} disabled={disabled} onChange={(e) => setOpsPresent(e.target.value)}>
            {YN.map((v) => (
              <option key={v} value={v}>
                {v || '—'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>CxA present</label>
          <select value={cxaPresent} disabled={disabled} onChange={(e) => setCxaPresent(e.target.value)}>
            {YN.map((v) => (
              <option key={v} value={v}>
                {v || '—'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>GC present</label>
          <select value={gcPresent} disabled={disabled} onChange={(e) => setGcPresent(e.target.value)}>
            {YN.map((v) => (
              <option key={v} value={v}>
                {v || '—'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label>Were issues found?</label>
        <select value={issuesFound} disabled={disabled} onChange={(e) => setIssuesFound(e.target.value)}>
          {YN.map((v) => (
            <option key={v} value={v}>
              {v || '—'}
            </option>
          ))}
        </select>
      </div>

      {showIssueFields && (
        <div className="rtft-issue-fields">
          <div className="form-field">
            <label>Were they corrected immediately?</label>
            <select value={corrected} disabled={disabled} onChange={(e) => setCorrected(e.target.value)}>
              {YN.map((v) => (
                <option key={v} value={v}>
                  {v || '—'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Issue description</label>
            <textarea value={issueDesc} disabled={disabled} onChange={(e) => setIssueDesc(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Were they entered into BIM?</label>
            <select value={enteredBim} disabled={disabled} onChange={(e) => setEnteredBim(e.target.value)}>
              {YN.map((v) => (
                <option key={v} value={v}>
                  {v || '—'}
                </option>
              ))}
            </select>
          </div>
          {showBimNumber && (
            <div className="form-field">
              <label>BIM issue number</label>
              <input type="text" value={bimNumber} disabled={disabled} onChange={(e) => setBimNumber(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="form-field">
        <label>L2 pass?</label>
        <select value={l2Pass} disabled={disabled} onChange={(e) => setL2Pass(e.target.value)}>
          {YN.map((v) => (
            <option key={v} value={v}>
              {v || '—'}
            </option>
          ))}
        </select>
      </div>

      <button className="seal-submit-btn" type="button" disabled={disabled} onClick={submit}>
        Submit RTFT Entry
      </button>
      <div className={msg.cls}>{statusText}</div>
      <div className="q-hint">Saved to the RTFT records table for this asset.</div>
    </div>
  )
}
