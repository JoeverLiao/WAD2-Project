import { test, expect } from '@playwright/test'

test('navigates from the empty home page to every feature and back', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Full Circle')
  await expect(page.locator('main')).toHaveText('')

  const links = page.getByRole('navigation').getByRole('link')
  await expect(links).toHaveCount(10)
  const labels = await links.allTextContents()
  for (const label of labels) {
    const link = page.getByRole('link', { name: label, exact: true })
    const href = await link.getAttribute('href')
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(
      page.getByRole('main').getByRole('region', { name: label, exact: true }),
    ).toBeAttached()
  }

  await page.reload()
  await expect(page.getByRole('region', { name: 'Profile', exact: true })).toBeAttached()
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeAttached()
  await expect(page.locator('main')).toHaveText('')
})
