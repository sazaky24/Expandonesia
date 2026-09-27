/** Small display helpers shared by the mobile screens. */

export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** exponent
  const decimals = exponent === 0 || scaled >= 100 ? 0 : 1
  return `${scaled.toFixed(decimals)} ${units[exponent]}`
}

/** Month name used by the backend title rewrite (always upper-case English). */
export const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

export function currentMonthName() {
  return MONTHS[new Date().getMonth()] ?? MONTHS[0]
}
