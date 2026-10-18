import { expect, test } from '@playwright/test'
import { decide, drawUntilStop, EVELYN, handOver, noA11yViolations } from './helpers'

test('practice mode: full game in the browser, survives a refresh', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('./')
  await page.getByRole('link', { name: /Start with Evelyn/ }).click()
  await expect(page.getByText('Practice · not saved')).toBeVisible()
  await page.getByRole('button', { name: 'Start the shift' }).click()
  await drawUntilStop(page)
  await decide(page, EVELYN.d1)

  // A refresh replays the command log through the engine and lands in the same place.
  await page.reload()
  await expect(page.locator('#feedback-title')).toHaveText(/Tell Priya/)
  await expect(page.locator('ol li').filter({ hasText: 'your decision' })).toHaveCount(1)

  await drawUntilStop(page)
  await decide(page, EVELYN.d2)
  await drawUntilStop(page)
  await handOver(page)
  await expect(page.locator('#debrief-score')).toContainText('100')
  await noA11yViolations(page, 'practice debrief')
  expect(errors).toEqual([])
})

test('practice mode: every scenario starts and reaches its first decision', async ({ page }) => {
  for (const id of ['evelyn', 'ruth', 'arthur']) {
    await page.goto(`./play/?scenario=${id}&new=1`)
    await page.getByRole('button', { name: 'Start the shift' }).click()
    await drawUntilStop(page)
    await expect(page.locator('#decision-title')).toBeVisible()
  }
})

test('the chart view works without 3D', async ({ page }) => {
  await page.goto('./play/?scenario=arthur&new=1')
  await page.getByRole('button', { name: 'Lines', exact: true }).click()
  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  await noA11yViolations(page, 'chart view')
})
