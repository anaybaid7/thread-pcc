import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** WCAG 2.1 AA on the settled page (motion paused so nothing is measured mid-fade). */
export async function noA11yViolations(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(100)
  const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

const go = async (page: Page, name: RegExp) => {
  await page.getByRole('navigation', { name: 'Workflows' }).getByRole('link', { name }).click()
}

/** Workflow 1: Maya checks Evelyn against her usual and sends the changes to the nurse. */
export async function spotIt(page: Page) {
  await go(page, /Spot it/)
  await page.getByRole('button', { name: /Evelyn Carter/ }).click()
  const mark = async (area: string, status: string, finding?: string) => {
    await page.getByRole('group', { name: area }).getByRole('button', { name: status }).click()
    if (finding) await page.getByRole('button', { name: finding, exact: true }).click()
  }
  await mark('Mobility', 'Different', 'Stayed in bed or room')
  await mark('Eating', 'Different', 'Ate about a quarter')
  await mark('Mood and engagement', 'Different', 'Quieter than usual')
  await mark('Thinking', 'Usual')
  await page.getByRole('button', { name: 'Send to Priya' }).click()
  await expect(page.getByText(/Sent to Priya at/)).toBeVisible()
}

/** Workflow 2: Priya opens Evelyn, checks something not yet known, and starts a watch with a recheck. */
export async function sizeItUp(page: Page) {
  await go(page, /Size it up/)
  await page.getByRole('button', { name: /Evelyn Carter/ }).click()
  await expect(page.getByText('Needs a recorded outcome for mobility, eating, mood')).toBeVisible()
  await page.getByLabel('Check').selectOption('temp')
  await page.getByLabel(/Value/).fill('37.6')
  await expect(page.getByText(/Outside usual: 37.6 °C, above her usual/)).toBeVisible()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.getByRole('button', { name: /^Watch Evelyn, recheck at/ }).click()
  await expect(page.getByText(/^Watching$/).first()).toBeVisible()
}

/** Workflow 3: Daniel moves to the 15:00 shift change and takes on every item. */
export async function carryForward(page: Page) {
  await go(page, /Carry it forward/)
  await page.getByRole('button', { name: /Move the clock to 15:00/ }).click()
  await expect(page.getByText('Fluids offered 3 times, no amount recorded')).toBeVisible()
  const take = page.getByRole('button', { name: 'Take it on' })
  for (let n = await take.count(); n > 0; n--) {
    await take.first().click()
    await expect(take).toHaveCount(n - 1)
  }
  await expect(page.getByText(/nothing left unowned/)).toBeVisible()
}
