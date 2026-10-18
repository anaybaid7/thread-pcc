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
