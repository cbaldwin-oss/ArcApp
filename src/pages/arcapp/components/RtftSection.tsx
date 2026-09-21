import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useGetRtft } from '../../../lib/api'
import type { RtftRow } from '../../../lib/api'

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
  /** The asset/equipment this entry is logged against — a scheduled activity's row.asset when
   * run from the Activity Drawer, or whatever's picked in the standalone RTFT Tracker form. */
  equipment: string
  authUser: string | null
  selectedDate: string
  onSubmit: (payload: RtftPayload) => Promise<void>
}

const YN = ['', 'Yes', 'No']

export default function RtftSection({ equipment, authUser, selectedDate, onSubmit }: Props) {
  // Just to denote "this asset already has one" — doesn't block re-submitting (a legitimate
  // re-inspection after a failed one still needs a new entry), so no extra prop plumbing from
  // whichever parent (Activity Drawer or the standalone RTFT Tracker form) is fetched instead.
  const existingFn = useGetRtft()
  useEffect(() => {
    void existingFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const alreadyLogged = ((existingFn.data as RtftRow[] | undefined) ?? []).some((r) => r.equipment === equipment)

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

  // Reset whenever the asset being logged against changes.
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
  }, [equipment, authUser])

  // No sign-in required to submit an RTFT entry yet — the inspector field is still pre-filled
  // from authUser when available, just not required. Revisit once real auth is in place.
  const disabled = busy
  const showIssueFields = issuesFound === 'Yes'
  const showBimNumber = showIssueFields && enteredBim === 'Yes'

  async function submit() {
    if (!issuesFound || !l2Pass) {
      setMsg({ text: 'Answer "Were issues found?" and "L2 pass?" before submitting.', cls: 'q-hint err' })
      return
    }
    const payload: RtftPayload = {
      date: selectedDate,
      equipment: equipment || '',
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
      void existingFn.trigger()
      setMsg({ text: `Saved RTFT entry for "${equipment}".`, cls: 'q-hint ok' })
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

  const statusText = msg.text || (authUser ? `Signed in as ${authUser}.` : 'Not signed in — entry will save without an inspector signoff unless typed above.')

  return (
    <div className="q-block">
      <label className="q-label">Right the First Time (RTFT)</label>

      {alreadyLogged && (
        <div className="q-hint ok" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <CheckCircle2 style={{ width: 14, height: 14, flex: '0 0 auto' }} />
          An RTFT entry already exists for &quot;{equipment}&quot; — see the RTFT Tracker page.
          Submitting below adds another one rather than replacing it.
        </div>
      )}

      <div className="form-field">
        <label>Equipment</label>
        <input type="text" value={equipment || ''} disabled />
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
