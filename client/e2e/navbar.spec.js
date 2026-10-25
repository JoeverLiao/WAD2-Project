import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{}',
    }),
  )
  await page.goto('/')
})

async function openMenu(page) {
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.locator('.radial-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
}

async function centered(page, key) {
  const option = page.locator(`[data-nav-key="${key}"]`)
  await expect(option).toHaveClass(/is-selected/)
  await expect
    .poll(async () => {
      const nav = await page.getByRole('navigation').boundingBox()
      const item = await option.boundingBox()
      return (
        Math.abs(item.x + item.width / 2 - nav.x - nav.width / 2) +
        Math.abs(item.y + item.height / 2 - 151)
      )
    })
    .toBeLessThan(1)
}

test('opens over the page without moving content and closes accessibly', async ({ page }) => {
  const mainTop = await page.locator('main').evaluate((el) => el.getBoundingClientRect().top)
  await expect(page.locator('.radial-panel')).toHaveAttribute('inert', '')
  await openMenu(page)
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
  expect(await page.locator('main').evaluate((el) => el.getBoundingClientRect().top)).toBe(mainTop)
  await page.getByRole('link', { name: 'Home', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
  await expect(page.locator('.radial-panel')).toHaveAttribute('inert', '')
  await expect(page.locator('.radial-panel')).toBeHidden()
  expect(await page.locator('main').evaluate((el) => el.getBoundingClientRect().top)).toBe(mainTop)
})

test('rotates each selected destination to the center and follows browser history', async ({
  page,
}) => {
  await openMenu(page)
  await centered(page, 'home')
  await page.getByRole('link', { name: 'Neighbour Food Rescue', exact: true }).click()
  await expect(page).toHaveURL(/food-rescue$/)
  await centered(page, 'food-rescue')
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
  await expect(page.locator('.radial-panel')).toBeHidden()
  await openMenu(page)
  await page.getByRole('link', { name: 'Food Waste Analytics', exact: true }).click()
  await centered(page, 'analytics')
  await expect(page.locator('.radial-panel')).toBeHidden()
  await page.goBack()
  await openMenu(page)
  await centered(page, 'food-rescue')
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(page.locator('.orbit-option:not(.is-selected) .orbit-label').first()).toHaveCSS(
    'opacity',
    '0',
  )
})

test('all mobile icons remain reachable, including keyboard account navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await openMenu(page)
  await centered(page, 'home')
  const reachable = await page.locator('.orbit-option').evaluateAll((options) =>
    options.every((option) => {
      const rect = option.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return rect.x >= 0 && rect.right <= window.innerWidth && option.contains(hit)
    }),
  )
  expect(reachable).toBe(true)
  const profile = page.getByRole('button', { name: 'Profile', exact: true })
  await profile.focus()
  await page.keyboard.press('ArrowDown')
  await centered(page, 'profile')
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/login$/)
  await centered(page, 'profile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('hover follows the pointer; page clicks glow without blocking clicks', async ({ page }) => {
  await openMenu(page)
  const nav = await page.getByRole('navigation').boundingBox()
  await page.mouse.move(nav.x + nav.width / 2 + 230, 90)
  await expect(page.locator('.nav-light')).toHaveCSS('opacity', '1')
  await expect
    .poll(() =>
      page.getByRole('navigation').evaluate((el) => el.style.getPropertyValue('--light-x')),
    )
    .toBe(`${nav.width / 2 + 230}px`)
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.textContent = 'Page click target'
    button.style.cssText = 'position:fixed;left:20px;top:400px'
    button.onclick = () => {
      button.textContent = 'Page click received'
    }
    document.body.append(button)
  })
  await page.getByRole('button', { name: 'Page click target', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page click received', exact: true })).toBeVisible()
  await expect(page.locator('.page-click-glow')).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible()
  await expect(page.locator('.page-click-glow')).toHaveCount(0)
})

test('reduced motion keeps the same interactions without rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMenu(page)
  await page.getByRole('link', { name: 'Smart Fridge', exact: true }).click()
  await centered(page, 'fridge')
  await expect(page.locator('.radial-panel')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.radial-panel')).toBeHidden()
})

test('the donut center is transparent and does not intercept the page', async ({ page }) => {
  await openMenu(page)
  const hitIsPage = await page.evaluate(
    () => !document.elementFromPoint(window.innerWidth / 2, 80)?.closest('nav'),
  )
  expect(hitIsPage).toBe(true)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  // Reselecting the current destination also closes, even without a route change.
  await expect(page.locator('.radial-panel')).toBeHidden()
  await openMenu(page)
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
})

test('unselected icons show animated tooltips on hover and keyboard focus', async ({ page }) => {
  await openMenu(page)
  await centered(page, 'home')
  await expect(page.getByText('Full Circle', { exact: true })).toHaveCount(0)
  const rescue = page.getByRole('link', { name: 'Neighbour Food Rescue', exact: true })
  await rescue.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Neighbour Food Rescue')
  await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
  await expect(rescue).not.toHaveAttribute('title')
  await page.mouse.move(20, 400)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close navigation', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('tooltip')).toHaveText('Profile')
  await page.keyboard.press('Tab')
  await page.getByRole('link', { name: 'Home', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 812 })
  await page.getByRole('link', { name: 'Freshness & Recipes', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
  const box = await page.getByRole('tooltip').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  await page.getByRole('link', { name: 'Freshness & Recipes', exact: true }).click()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.locator('.radial-panel')).toBeHidden()
})
