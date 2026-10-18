import { expect, test } from '@playwright/test'
import { decide, drawUntilStop, EVELYN, handOver, noA11yViolations } from './helpers'

test('saved mode: play Evelyn end to end, persisted, then replay the other version', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await noA11yViolations(page, 'home')
  await page.getByRole('link', { name: /Start with Evelyn/ }).click()
  await expect(page).toHaveURL(/attempt=[0-9a-f-]{36}/)
  const attemptId = new URL(page.url()).searchParams.get('attempt')!
  await expect(page.getByText(/Saved · local DB/)).toBeVisible()
  await page.getByRole('button', { name: 'Start the shift →' }).click()

  await drawUntilStop(page)
  await noA11yViolations(page, 'decision')
  await decide(page, EVELYN.d1)
  await expect(page.locator('#feedback-title')).toHaveText('Strong call.')

  // The decision is in PostgreSQL with exactly the evidence that was on screen.
  const log = await (await request.get(`http://127.0.0.1:8010/api/attempts/${attemptId}/log`)).json()
  const decided = log.log.find((e: { type: string }) => e.type === 'decision_made')
  expect(decided.payload.evidence).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])

  // Reloading continues the same saved attempt.
  await page.reload()
  await expect(page.locator('#feedback-title')).toBeVisible()

  await drawUntilStop(page)
  await decide(page, EVELYN.d2)
  await drawUntilStop(page)
  await noA11yViolations(page, 'handover')
  await handOver(page)
  await expect(page.getByRole('img', { name: '100 out of 100' })).toBeVisible()
  await noA11yViolations(page, 'debrief')

  await page.getByRole('button', { name: 'Play the other version' }).click()
  await expect(page).not.toHaveURL(new RegExp(attemptId))
  await expect(page.getByText('replay', { exact: true })).toBeVisible()

  // The original attempt is untouched and still complete.
  const original = await (await request.get(`http://127.0.0.1:8010/api/attempts/${attemptId}`)).json()
  expect(original.view.phase).toBe('complete')
  expect(original.view.debrief.total).toBe(100)

  await page.goto('/attempts')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await noA11yViolations(page, 'attempts')
  expect(errors).toEqual([])
})

test('saved mode: the API refuses a stale revision instead of overwriting', async ({ request }) => {
  const created = await (await request.post('http://127.0.0.1:8010/api/attempts', { data: { scenarioId: 'ruth' } })).json()
  const ok = await request.post(`http://127.0.0.1:8010/api/attempts/${created.attempt.id}/advance`, { data: { revision: 0 } })
  expect(ok.status()).toBe(200)
  const stale = await request.post(`http://127.0.0.1:8010/api/attempts/${created.attempt.id}/advance`, { data: { revision: 0 } })
  expect(stale.status()).toBe(409)
})
