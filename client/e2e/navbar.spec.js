import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/')
})

async function openMenu(page) {
  await page.mouse.move(5, 700)
  await page.getByRole('button', { name: 'Open navigation', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.radial-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
}
async function choose(page, name) {
  await page
    .getByRole('navigation')
    .getByRole(name === 'Profile' ? 'button' : 'link', { name, exact: true })
    .locator('.nav-icon')
    .click()
}
async function selected(page, key, label) {
  const option = page.locator(`[data-nav-key="${key}"]`)
  await expect(option).toHaveClass(/is-selected/)
  await expect(page.locator('.wheel-current')).toHaveText(label)
  await expect
    .poll(async () => {
      const segmentColor = await option.evaluate((el) => getComputedStyle(el).backgroundColor)
      const centerColor = await page
        .locator('.wheel-current')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      return segmentColor === centerColor
    })
    .toBe(true)
}

test('hover opens the full wheel over the page, and leaving the circle closes it', async ({
  page,
}) => {
  const top = await page.locator('main').evaluate((el) => el.getBoundingClientRect().top)
  await expect(page.locator('.radial-panel')).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Open navigation', exact: true }).hover()
  await expect(page.locator('.radial-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await selected(page, 'home', 'Home')
  await expect(page.locator('.nav-page-dim')).toBeVisible()
  await expect(page.locator('.nav-page-dim')).toHaveCSS('pointer-events', 'none')
  expect(await page.locator('main').evaluate((el) => el.getBoundingClientRect().top)).toBe(top)
  const rect = await page.locator('.radial-panel').boundingBox()
  expect(rect.width).toBeCloseTo(rect.height, 0)
  // The gap between the toggle and circle remains traversable.
  await page.mouse.move(rect.x + rect.width / 2, 76)
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 30)
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible()
  await page.mouse.move(rect.x + 2, rect.y + 2)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await expect(page.locator('.nav-page-dim')).toHaveCount(0)
})

test('selection changes the center and segment color without moving any icons', async ({
  page,
}) => {
  await openMenu(page)
  const icons = page.locator('.sector-content')
  const before = await icons.evaluateAll((els) =>
    els.map((el) => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })),
  )
  await choose(page, 'Food Waste Analytics')
  await expect(page).toHaveURL(/analytics$/)
  await selected(page, 'analytics', 'Food Waste Analytics')
  const after = await icons.evaluateAll((els) =>
    els.map((el) => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })),
  )
  expect(after).toEqual(before)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await openMenu(page)
  await selected(page, 'analytics', 'Food Waste Analytics')
  await page.goBack()
  await selected(page, 'home', 'Home')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
})

test('the whole wedge is clickable and arrow keys move between fixed options', async ({ page }) => {
  await openMenu(page)
  const home = page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true })
  await home.focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true }),
  ).toBeFocused()
  const rect = await page.locator('.radial-panel').boundingBox()
  // Click near the outer edge of Dashboard's wedge, beyond its icon and label.
  await page.mouse.click(rect.x + rect.width * 0.81, rect.y + rect.height * 0.19)
  await expect(page).toHaveURL(/dashboard$/)
  await selected(page, 'dashboard', 'Dashboard')
})

test('all eight fixed icons remain clickable on mobile and short landscape screens', async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 812 },
    { width: 700, height: 375 },
  ]) {
    await page.setViewportSize(viewport)
    await openMenu(page)
    const reachable = await page.locator('.orbit-option').evaluateAll((options) =>
      options.every((option) => {
        const rect = option.querySelector('.nav-icon').getBoundingClientRect()
        return (
          rect.x >= 0 &&
          rect.right <= innerWidth &&
          rect.y >= 0 &&
          rect.bottom <= innerHeight &&
          option.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          )
        )
      }),
    )
    expect(reachable).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    )
    await page.keyboard.press('Escape')
  }
})

test('Profile remains selected for account destinations and the center names the current page', async ({
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
    await choose(page, 'Profile')
    await selected(page, 'profile', 'Profile')
    await page.locator('.account-menu').getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`))
    await selected(page, 'profile', name)
    await expect(page.locator('.radial-panel')).toBeHidden()
    await openMenu(page)
    await selected(page, 'profile', name)
  }
})

test('account menus follow login state and logout supports a failed retry', async ({ page }) => {
  async function showAccount() {
    await openMenu(page)
    await choose(page, 'Profile')
  }
  await showAccount()
  await expect(page.locator('.account-menu a')).toHaveText(['Login', 'Register'])
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"id":"preview","username":"Demo","email":"preview@example.test"}',
    }),
  )
  await page.locator('.account-menu').getByRole('link', { name: 'Login', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('preview@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/dashboard$/)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await showAccount()
  await expect(page.locator('.account-menu a')).toHaveText(['Profile'])
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
  const logout = page.getByRole('navigation').getByRole('button', { name: 'Logout', exact: true })
  await logout.click()
  await expect(page.getByRole('navigation').getByRole('alert')).toHaveText('Try again')
  await logout.click()
  await expect(page).toHaveURL(/login$/)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await showAccount()
  await expect(page.locator('.account-menu a')).toHaveText(['Login', 'Register'])
  await expect(logout).toHaveCount(0)
  expect(attempts).toBe(2)
})

test('hover labels and page click glow still work', async ({ page }) => {
  await openMenu(page)
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Dashboard', exact: true })
    .locator('.nav-icon')
    .hover()
  await expect(page.getByRole('tooltip')).toHaveText('Dashboard')
  await expect(page.locator('.nav-light')).toHaveCSS('opacity', '1')
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.textContent = 'Page click target'
    button.style.cssText = 'position:fixed;left:20px;top:650px;z-index:10'
    button.onclick = () => {
      button.textContent = 'Page click received'
    }
    document.body.append(button)
  })
  await page.getByRole('button', { name: 'Page click target', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page click received', exact: true })).toBeVisible()
  await expect(page.locator('.page-click-glow')).not.toHaveCount(0)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await expect(page.locator('.page-click-glow')).toHaveCount(0)
})

test('reduced motion opens and closes without transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMenu(page)
  await expect(page.locator('.radial-panel')).toHaveCSS('transition-duration', '0s')
  await choose(page, 'Smart Fridge')
  await selected(page, 'fridge', 'Smart Fridge')
  await expect(page.locator('.radial-panel')).toBeHidden()
})

test.describe('touch navigation', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } })

  test('tap opens the wheel and selects a fixed sector', async ({ page }) => {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).tap()
    await expect(page.locator('.radial-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Smart Fridge', exact: true })
      .locator('.nav-icon')
      .tap()
    await expect(page).toHaveURL(/fridge$/)
    await selected(page, 'fridge', 'Smart Fridge')
    await expect(page.locator('.radial-panel')).toBeHidden()
  })
})

test('highlight sweeps to the next segment while clicked icons animate in place', async ({
  page,
}) => {
  await openMenu(page)
  const icon = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Dashboard', exact: true })
    .locator('.nav-icon')
  const slot = page.locator('[data-nav-key="dashboard"] .sector-content')
  const position = await slot.boundingBox()
  await icon.click()
  expect(
    await icon.evaluate((el) =>
      el.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(true)
  const frames = await page.locator('.wheel-selection').evaluate(async (el) => {
    const frames = []
    const started = performance.now()
    while (performance.now() - started < 720) {
      frames.push(getComputedStyle(el).transform)
      await new Promise(requestAnimationFrame)
    }
    return frames
  })
  expect(new Set(frames).size).toBeGreaterThan(5)
  await expect(page).toHaveURL(/dashboard$/)
  await selected(page, 'dashboard', 'Dashboard')
  expect(await slot.boundingBox()).toEqual(position)
  await icon.click()
  expect(
    await icon.evaluate((el) =>
      el.getAnimations().some((animation) => animation.playState === 'running'),
    ),
  ).toBe(true)
  await expect(page.locator('.radial-panel')).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMenu(page)
  const home = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Home', exact: true })
    .locator('.nav-icon')
  await home.click()
  await expect(page.locator('.wheel-selection')).toHaveCSS('transition-duration', '0s')
  expect(await home.evaluate((el) => el.getAnimations().length)).toBe(0)
})

test('Profile opens nested center choices with arrow-key navigation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await openMenu(page)
  const profile = page.getByRole('navigation').getByRole('button', { name: 'Profile', exact: true })
  await profile.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.locator('.account-menu')
  await expect(menu.getByRole('link', { name: 'Login', exact: true })).toBeFocused()
  const wheel = await page.locator('.radial-panel').boundingBox()
  await expect(menu).toHaveCSS('opacity', '1')
  const box = await menu.boundingBox()
  expect(Math.abs(box.x + box.width / 2 - wheel.x - wheel.width / 2)).toBeLessThan(1)
  expect(Math.abs(box.y + box.height / 2 - wheel.y - wheel.height / 2)).toBeLessThan(1)
  for (const action of await menu.locator('a').all()) {
    const rect = await action.boundingBox()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('ArrowRight')
  await expect(menu.getByRole('link', { name: 'Register', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(profile).toBeFocused()
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible()
})

test('each fixed icon has its own hover animation and honors reduced motion', async ({ page }) => {
  await openMenu(page)
  const animations = []
  for (const option of await page.locator('.orbit-option').all()) {
    await option.locator('.nav-icon').hover()
    const animation = await option
      .locator('.icon-hover')
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(animation).not.toBe('none')
    animations.push(animation)
  }
  expect(new Set(animations).size).toBe(8)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('[data-nav-key="profile"] .icon-hover')).toHaveCSS(
    'animation-name',
    'none',
  )
})
