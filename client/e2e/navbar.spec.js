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
  await page.mouse.move(20, 400)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).focus()
  await page.keyboard.press('Enter')
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
    button.style.cssText = 'position:fixed;left:20px;top:400px;z-index:10'
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
  await expect(page.locator('.radial-panel')).toBeHidden()
  await openMenu(page)
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

test('hover opens the donut and leaving its curved boundary closes it', async ({ page }) => {
  await page.getByRole('button', { name: 'Open navigation', exact: true }).hover()
  await expect(page.locator('.radial-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  const nav = await page.getByRole('navigation').boundingBox()
  // Crossing the transparent center must not close the menu on the way to an icon.
  await page.mouse.move(nav.x + nav.width / 2, 80)
  await page.mouse.move(nav.x + nav.width / 2, 151, { steps: 6 })
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible()
  // This point is inside the rectangular bounds but outside the actual donut.
  await page.mouse.move(nav.x + 4, 200)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await page.getByRole('button', { name: 'Open navigation', exact: true }).hover()
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible()
})

test('Profile remains selected when closing its dropdown and choosing account pages', async ({
  page,
}) => {
  for (const name of ['Login', 'Register', 'Profile']) {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: name === 'Profile' ? 200 : 401,
        contentType: 'application/json',
        body: name === 'Profile' ? '{"id":"preview","username":"Demo"}' : '{}',
      }),
    )
    await page.goto('/analytics')
    await openMenu(page)
    const profile = page.getByRole('button', { name: 'Profile', exact: true })
    await profile.click()
    await centered(page, 'profile')
    await profile.click()
    await expect(profile).toHaveAttribute('aria-expanded', 'false')
    await centered(page, 'profile')
    await profile.click()
    // Record every rendered selection, including the frame before routing finishes.
    await page.evaluate(() => {
      window.accountSelections = []
      let frames = 0
      function sample() {
        const nav = document.querySelector('.orbit-navbar')
        if (!nav?.classList.contains('is-open') || frames++ > 100) return
        window.accountSelections.push(nav.querySelector('.is-selected')?.dataset.navKey)
        requestAnimationFrame(sample)
      }
      sample()
    })
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`))
    await centered(page, 'profile')
    await expect(page.locator('.radial-panel')).toBeHidden()
    const selections = await page.evaluate(() => window.accountSelections)
    expect(selections.length).toBeGreaterThan(0)
    expect(selections.every((key) => key === 'profile')).toBe(true)
    await openMenu(page)
    await centered(page, 'profile')
  }
})

test('account links react to login and logout, including a failed logout retry', async ({
  page,
}) => {
  const nav = page.getByRole('navigation')
  async function showAccount() {
    await openMenu(page)
    await nav.getByRole('button', { name: 'Profile', exact: true }).click()
    await centered(page, 'profile')
  }
  await showAccount()
  await expect(nav.locator('.account-menu a')).toHaveText(['Login', 'Register'])
  await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0)
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"id":"preview","username":"Demo","email":"preview@example.test"}',
    }),
  )
  await nav.getByRole('link', { name: 'Login', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('preview@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/dashboard$/)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await showAccount()
  await expect(nav.locator('.account-menu a')).toHaveText(['Profile'])
  await expect(nav.getByRole('button', { name: 'Logout', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0)
  let attempts = 0
  await page.route('**/api/auth/logout', (route) => {
    attempts++
    expect(route.request().method()).toBe('POST')
    return route.fulfill({
      status: attempts === 1 ? 500 : 200,
      contentType: 'application/json',
      body: attempts === 1 ? '{"error":"Try again"}' : '{}',
    })
  })
  await nav.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(nav.getByRole('alert')).toHaveText('Try again')
  await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(page).toHaveURL(/login$/)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await showAccount()
  await expect(nav.locator('.account-menu a')).toHaveText(['Login', 'Register'])
  await expect(nav.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0)
  expect(attempts).toBe(2)
})
