import { expect, test } from '@playwright/test'
import { carryForward, noA11yViolations, sizeItUp, spotIt } from './helpers'

test('practice mode: the three workflows in the browser, kept across a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(page.getByText('Practice · this browser')).toBeVisible()
  await spotIt(page)
  await page.reload()
  await sizeItUp(page)
  await carryForward(page)
  await noA11yViolations(page, 'practice handover')
  await page.getByRole('link', { name: /Why it works/ }).click()
  await noA11yViolations(page, 'why')
  expect(errors).toEqual([])
})

test('practice mode: a concern cannot be closed without an outcome, and reset restores the ward', async ({ page }) => {
  await page.goto('./')
  await spotIt(page)
  await page.getByRole('navigation', { name: 'Workflows' }).getByRole('link', { name: /Size it up/ }).click()
  await page.getByRole('button', { name: /Evelyn Carter/ }).click()
  await expect(page.getByRole('button', { name: 'Close: back to usual' })).toBeDisabled()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await expect(page.getByText('Evelyn hasn’t been reported yet.')).toBeVisible()
})

test('practice mode: charting on the top resident does not switch the panel to someone else', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('navigation', { name: 'Workflows' }).getByRole('link', { name: /Size it up/ }).click()
  await expect(page.getByRole('heading', { name: /^Harold Singh/ })).toBeVisible()
  await page.getByLabel('Check').selectOption('spo2')
  await page.getByLabel(/Value/).fill('95')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  // Harold is no longer overdue, so the board reorders; the panel must stay on Harold.
  await expect(page.getByText('Watching').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Harold Singh/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Check Harold' })).toBeVisible()
})
