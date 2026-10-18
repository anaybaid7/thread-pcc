import { expect, test } from '@playwright/test'
import { carryForward, noA11yViolations, sizeItUp, spotIt } from './helpers'

test('saved mode: the three workflows, stored in PostgreSQL and replayed on reload', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByText(/Saved · local DB/)).toBeVisible()
  await noA11yViolations(page, 'home')

  await spotIt(page)
  await noA11yViolations(page, 'spot')
  await sizeItUp(page)
  await noA11yViolations(page, 'size')
  await carryForward(page)
  await noA11yViolations(page, 'handover')

  const id = await page.evaluate(() => localStorage.getItem('thread:ward:id'))
  const ws = await (await request.get(`http://127.0.0.1:8010/api/workspaces/${id}`)).json()
  expect(ws.seq).toBeGreaterThan(8)

  await page.reload()
  await expect(page.getByText(/nothing left unowned/)).toBeVisible()
  expect(errors).toEqual([])
})

test('saved mode: a stale tab cannot overwrite the ward', async ({ request }) => {
  const ws = await (await request.post('http://127.0.0.1:8010/api/workspaces')).json()
  const cmd = { type: 'measure', by: 'sam', residentId: 'arthur', kind: 'fluids', value: 300 }
  expect((await request.post(`http://127.0.0.1:8010/api/workspaces/${ws.id}/commands`, { data: { seq: 0, command: cmd } })).status()).toBe(200)
  expect((await request.post(`http://127.0.0.1:8010/api/workspaces/${ws.id}/commands`, { data: { seq: 0, command: cmd } })).status()).toBe(409)
})
