/**
 * Shared Tailwind class strings for settings pages: cards, labels, inputs.
 * Ensures consistent visual styling and spacing.
 */

/** Card: hairline separator, 12px radius, 24px padding */
export const SETTINGS_CARD_CLASS =
  'border border-app-separator rounded-[12px] bg-app-surface p-6'

/** Label: proper spacing below (above the input) */
export const SETTINGS_LABEL_CLASS =
  'block text-[13px] font-medium text-app-label mb-1.5'

/** Text input / select: ~40px height, 8px radius, consistent padding, blue focus ring */
export const SETTINGS_INPUT_CLASS =
  'h-10 w-full rounded-[10px] border border-app-separator bg-app-surface px-3 py-2 text-[13px] text-app-label transition-colors focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent'

/** Read-only input (e.g. verified email) */
export const SETTINGS_INPUT_READONLY_CLASS =
  'h-10 w-full rounded-[10px] border border-app-separator bg-app-fill px-3 py-2 text-[13px] text-app-secondary'

/** Textarea: same border/radius/focus, min height, resize */
export const SETTINGS_TEXTAREA_CLASS =
  'min-h-[100px] w-full rounded-[10px] border border-app-separator bg-app-surface px-3 py-2 text-[13px] text-app-label resize-y transition-colors focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent'

/** Form actions container: right-aligned, consistent top spacing */
export const SETTINGS_ACTIONS_CLASS = 'mt-8 flex justify-end gap-3'

/** Secondary button (Cancel) */
export const SETTINGS_BTN_SECONDARY_CLASS =
  'h-9 rounded-[10px] bg-app-fill px-4 text-[13px] font-medium text-app-label transition-colors hover:bg-app-fill-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 disabled:opacity-40'

/** Primary button (Save Changes) */
export const SETTINGS_BTN_PRIMARY_CLASS =
  'h-9 rounded-[10px] bg-app-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 disabled:opacity-40'
