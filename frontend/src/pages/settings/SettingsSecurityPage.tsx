import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS } from '@/lib/settingsFormStyles'

export function SettingsSecurityPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-app-label">Security</h1>
        <p className="mt-1 text-[13px] text-app-secondary">
          Manage how you sign in. Session lists and API keys are not available in this version.
        </p>
      </header>

      <Card className={SETTINGS_CARD_CLASS}>
        <h2 className="text-[13px] font-semibold text-app-label">This device</h2>
        <p className="mt-2 text-[13px] text-app-secondary">
          You are signed in on this browser. Use Log out in the account menu to end the session.
        </p>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <h2 className="text-[13px] font-semibold text-app-label">Account deletion</h2>
        <p className="mt-2 text-[13px] text-app-secondary">
          Self-serve account deletion is not available yet. Email your workspace admin if you need this
          account removed.
        </p>
      </Card>

      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} disabled>
          Cancel
        </button>
        <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS} disabled>
          Save changes
        </button>
      </div>
    </>
  )
}
