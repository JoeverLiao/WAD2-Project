import {
  test,
  expect,
  accountDetails,
  BOB,
  signIn,
  json,
} from './helpers/helpers.js'

test('Bob logs in, updates his profile, reloads and logs out', async ({
  page,
  context,
  member,
}) => {
  const originalName = member.user.name

  await json(await context.request.post('/api/auth/logout'))

  await page.goto('/login')
  await page.getByLabel(/^Email:?$/).fill(BOB.email)
  await page.getByLabel(/^Password:?$/).fill(BOB.password)
  await page.getByRole('button', {
    name: 'Login',
    exact: true,
  }).click()

  await expect(page).toHaveURL(/\/dashboard$/)

  try {
    await page.goto('/profile')

    await page.getByRole('button', {
      name: 'Edit profile',
      exact: true,
    }).click()

    await page.locator('#edit-name').fill(`${BOB.username} E2E updated`)

    await page.getByRole('button', {
      name: 'Save',
      exact: true,
    }).click()

    await expect(
      page.getByRole('status').filter({
        hasText: 'Profile updated',
      }),
    ).toBeVisible()

    await page.reload()

    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toHaveText(`${BOB.username} E2E updated`)
  } finally {
    // Restore Bob's original name even if an assertion fails.
    await signIn(context, BOB)

    await json(
      await context.request.patch('/api/auth/me', {
        data: { username: originalName },
      }),
    )
  }

  await page.reload()

  // Listen before clicking so the logout response isn't missed.
  const logoutResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/auth/logout' &&
    response.request().method() === 'POST'
  )

  await page.getByRole('button', {
    name: 'Logout',
    exact: true,
  }).click()

  const response = await logoutResponse
  expect(response.status()).toBe(200)

  const profileResponse = await context.request.get('/api/auth/me')
  expect(profileResponse.status()).toBe(401)
})

test('register a new additional user through the registration form', async ({
  page,
  context,
}) => {
  const account = accountDetails()

  await page.goto('/register')

  await page.getByLabel('Username', { exact: true })
    .fill(account.username)

  await page.getByLabel(/^Email:?$/).fill(account.email)
  await page.getByLabel(/^Password:?$/).fill(account.password)

  await page.getByLabel('Confirm Password', { exact: true })
    .fill(account.password)

  await page.getByRole('button', {
    name: 'Register',
    exact: true,
  }).click()

  await expect(page).toHaveURL(/\/dashboard$/)

  const user = await json(
    await context.request.get('/api/auth/me'),
  )

  expect(user.email).toBe(account.email)
  expect(user.name).toBe(account.username)
})

test('wrong password displays an error without authenticating', async ({
  page,
  context,
  member,
}) => {
  await json(await context.request.post('/api/auth/logout'))

  try {
    await page.goto('/login')

    await page.getByLabel(/^Email:?$/).fill(BOB.email)
    await page.getByLabel(/^Password:?$/)
      .fill('Definitely-wrong-password')

    await page.getByRole('button', {
      name: 'Login',
      exact: true,
    }).click()

    await expect(page.getByRole('alert')).toContainText(
      'Invalid email or password',
    )

    const response = await context.request.get('/api/auth/me')
    expect(response.status()).toBe(401)
  } finally {
    // Restore authentication for fixture cleanup.
    await signIn(context, BOB)
  }
})

test('registration rejects an existing email', async ({
  page,
  context,
  member,
}) => {
  // The member fixture ensures Bob already exists.
  await json(await context.request.post('/api/auth/logout'))

  try {
    await page.goto('/register')

    await page.getByLabel('Username', { exact: true })
      .fill('Another Bob')

    await page.getByLabel(/^Email:?$/).fill(BOB.email)
    await page.getByLabel(/^Password:?$/).fill(BOB.password)

    await page.getByLabel('Confirm Password', { exact: true })
      .fill(BOB.password)

    await page.getByRole('button', {
      name: 'Register',
      exact: true,
    }).click()

    await expect(page.getByRole('alert')).toContainText(
      'An account with this email already exists',
    )

    await expect(page).toHaveURL(/\/register$/)

    const response = await context.request.get('/api/auth/me')
    expect(response.status()).toBe(401)
  } finally {
    await signIn(context, BOB)
  }
})

test('registration rejects mismatched passwords', async ({
  page,
  context,
}) => {
  const account = accountDetails()

  await page.goto('/register')

  await page.getByLabel('Username', { exact: true })
    .fill(account.username)

  await page.getByLabel(/^Email:?$/).fill(account.email)
  await page.getByLabel(/^Password:?$/).fill(account.password)

  await page.getByLabel('Confirm Password', { exact: true })
    .fill('Different-password-123')

  await page.getByRole('button', {
    name: 'Register',
    exact: true,
  }).click()

  await expect(page.getByRole('alert')).toContainText(
    'Passwords do not match',
  )

  await expect(page).toHaveURL(/\/register$/)

  const response = await context.request.get('/api/auth/me')
  expect(response.status()).toBe(401)
})