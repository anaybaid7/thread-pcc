import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export type Answers = { changed: string[]; sort: Record<string, string>; choice: RegExp }

/** The answers a careful player gives for Evelyn's two decisions (persisting course). */
export const EVELYN: Record<'d1' | 'd2', Answers> = {
  d1: {
    changed: ['Mobility', 'Meal intake', 'Engagement'],
    sort: { 'ate about a quarter': 'Observed', 'asked for a tray': 'Observed', 'just tired after Joan': 'Assumption', 'enough to drink today': 'Unknown', 'isn’t in any pain': 'Unknown' },
    choice: /Tell Priya, the charge nurse, now/,
  },
  d2: {
    changed: ['Still changed, and now affecting her walking too'],
    sort: { 'needed help to walk': 'Observed', 'much less than usual for two days': 'Observed', 'She’s dehydrated': 'Assumption', 'drank enough overnight': 'Unknown', 'age catching up': 'Assumption' },
    choice: /Give Priya a structured handover now/,
  },
}

/** WCAG 2.1 AA on the settled page: motion is paused first so text isn't measured mid-fade. */
export async function noA11yViolations(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(100)
  const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

export async function drawUntilStop(page: Page) {
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('#decision-title').count()) || (await page.locator('#handover-title').count())) return
    const deck = page.getByRole('button', { name: 'Draw next event' })
    if ((await deck.count()) && (await deck.isEnabled())) await deck.click()
    else await page.waitForTimeout(100)
  }
  throw new Error('No decision or handover appeared')
}

export async function decide(page: Page, d: Answers) {
  await expect(page.locator('#decision-title')).toBeVisible()
  for (const n of d.changed) await page.getByRole('button', { name: n, exact: true }).click()
  await page.getByRole('button', { name: 'Next →' }).click()
  for (const [text, bin] of Object.entries(d.sort)) {
    await page.locator('[data-drop="tray"] button', { hasText: text }).click()
    await page.getByRole('button', { name: `Put in ${bin}` }).click()
  }
  await expect(page.getByText('All sorted ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()
  await page.getByLabel(d.choice).check()
  await page.getByRole('button', { name: 'Lock it in' }).click()
  await expect(page.locator('#feedback-title')).toBeVisible()
}

export async function handOver(page: Page) {
  await expect(page.locator('#handover-title')).toBeVisible()
  await page.getByRole('button', { name: /Draft (with Gemini|from the template)/ }).click()
  await page.getByRole('button', { name: /Submit handover/ }).click()
  await expect(page.locator('#debrief-title')).toBeVisible()
}
