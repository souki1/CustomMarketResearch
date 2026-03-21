/**
 * Shared Tailwind class strings for settings pages: cards, labels, inputs.
 * Ensures consistent visual styling and spacing.
 */

/** Card: 1px light gray border, 10px radius, soft shadow, 24px padding */
export const SETTINGS_CARD_CLASS =
  'border border-gray-200 rounded-[10px] shadow-sm p-6'

/** Label: proper spacing below (above the input) */
export const SETTINGS_LABEL_CLASS =
  'block text-xs font-medium text-gray-700 mb-1.5'

/** Text input / select: ~40px height, 8px radius, consistent padding, blue focus ring */
export const SETTINGS_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'

/** Read-only input (e.g. verified email) */
export const SETTINGS_INPUT_READONLY_CLASS =
  'h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500'

/** Textarea: same border/radius/focus, min height, resize */
export const SETTINGS_TEXTAREA_CLASS =
  'min-h-[100px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-y transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'

/** Form actions container: right-aligned, consistent top spacing */
export const SETTINGS_ACTIONS_CLASS = 'mt-8 flex justify-end gap-3'

/** Secondary button (Cancel) */
export const SETTINGS_BTN_SECONDARY_CLASS =
  'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2'

/** Primary button (Save Changes) */
export const SETTINGS_BTN_PRIMARY_CLASS =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2'
