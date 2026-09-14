type TopbarProps = {
  userName: string | null
  userInitials: string
  onAuthClick: () => void
}

export default function Topbar({ userName, userInitials, onAuthClick }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 100 100" width="38" height="38">
            <path d="M14 66 A36 36 0 0 1 86 66" fill="none" stroke="url(#arcGrad)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="30" r="3.4" fill="#8ff2ae" />
            <defs>
              <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8ff2ae" />
                <stop offset="100%" stopColor="#1c8a4c" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="brand-text-wrap">
          <div className="brand-text">
            Arc<b>App</b>
          </div>
          <div className="brand-tagline">Mission Control for Commissioning</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="site-chip">
          <span className="led" /> STY4 · PHASE 2
        </div>
        <div
          className={userName ? 'auth-pill signed-in' : 'auth-pill'}
          title={userName ? `Signed in as ${userName} — click to sign out` : 'Click to sign in'}
          onClick={onAuthClick}
          role="button"
          tabIndex={0}
        >
          <div className="avatar">{userInitials}</div>
          <span>{userName ? userName.split('@')[0] : 'Sign In'}</span>
        </div>
      </div>
    </div>
  )
}
