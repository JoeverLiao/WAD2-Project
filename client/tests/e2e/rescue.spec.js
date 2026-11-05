import { fileURLToPath } from 'node:url'

import {
  signIn,
  ALICE,
  trackListing,
  openConversation,
} from './helpers/helpers.js'

import {
  test,
  expect,
  createListing,
  seedFood,
  listingData,
  uniqueName,
  json,
  id,
  clientKey,
  waitForEndpoint,
  expectSuccess,
  claim,
  setupPickup,
  listingState,
  requestState,
  requestAction,
  assertInventory,
  openThread,
  showNearby,
  openMyListing,
  openListingEditor,
  sendMessage,
  proposedWindow,
} from './helpers/rescue-helpers.js'

test.use({ reducedMotion: 'reduce' })
test.setTimeout(180_000)

test('neighbour requests food, owner replies and accepts, collection updates inventory', async ({
  page,
  context,
  browser,
  baseURL,
  member,
}) => {
  const food = await seedFood(context)
  const data = listingData(food.name, id(food))
  const { listing } = await createListing(context, data)
  const listingId = id(listing)

  const neighbour = await browser.newContext({
    baseURL,
    timezoneId: 'Asia/Singapore',
  })

  try {
    await signIn(neighbour, ALICE)

    // Keep Alice's search centre near the test pickup point.
    const nearbySetup = await createListing(
      neighbour,
      listingData(`E2E Alice map setup ${Date.now()}`),
    )

    await json(
      await neighbour.request.delete(
        `/api/rescue/${id(nearbySetup.listing)}`,
      ),
    )

    const neighbourPage = await neighbour.newPage()
    await neighbourPage.goto('/food-rescue')

    await neighbourPage.getByLabel(
      'Maximum distance from the search centre',
    ).selectOption('25')

    await neighbourPage.getByRole('searchbox', {
      name: 'Search food names',
    }).fill(food.name)

    const card = neighbourPage.locator('.food-card').filter({
      hasText: food.name,
    })

    await card.getByRole('button', {
      name: 'Request collection →',
      exact: true,
    }).click()

    const requestDialog = neighbourPage.getByRole('dialog', {
      name: food.name,
      exact: true,
    })

    await requestDialog.getByRole('button', {
      name: 'Use this window',
      exact: true,
    }).click()

    const claimed = neighbourPage.waitForResponse(response =>
      new URL(response.url()).pathname ===
        `/api/rescue/${listingId}/claim` &&
      response.request().method() === 'POST'
    )

    await requestDialog.getByRole('button', {
      name: 'Send request',
      exact: true,
    }).click()

    const { request } = await json(await claimed, 201)

    await expect(
      requestDialog.getByRole('status').filter({
        hasText: 'Request sent.',
      }),
    ).toContainText('Request sent')

    const ownerDialog = await openConversation(
      page,
      'received',
      food.name,
    )

    await ownerDialog.getByLabel('Write a reply', {
      exact: true,
    }).fill('Hello! I will meet you at the pickup point.')

    await ownerDialog.getByRole('button', {
      name: 'Send →',
      exact: true,
    }).click()

    await expect(ownerDialog.locator('.message-list'))
      .toContainText('Hello! I will meet you at the pickup point.')

    const accepted = waitForEndpoint(
      page,
      `/api/rescue/requests/${id(request)}/accept`,
    )

    await ownerDialog.getByRole('button', {
      name: 'Accept pickup',
      exact: true,
    }).click()

    await json(await accepted)

    const sentDialog = await openConversation(
      neighbourPage,
      'sent',
      food.name,
    )

    await expect(sentDialog.locator('.message-list'))
      .toContainText('Hello! I will meet you at the pickup point.')

    const reserved = await json(
      await context.request.get(`/api/rescue/${listingId}`),
    )

    expect(reserved.listing.status).toBe('claimed')

    await ownerDialog.getByRole('button', {
      name: 'Confirm collection',
      exact: true,
    }).click()

    const confirmation = page.getByRole('dialog', {
      name: 'Has the food been collected?',
      exact: true,
    })

    const collected = waitForEndpoint(
      page,
      `/api/rescue/${listingId}/collect`,
    )

    await confirmation.getByRole('button', {
      name: 'Yes, collected',
      exact: true,
    }).click()

    await json(await collected)

    const remaining = await json(
      await context.request.get(`/api/inventory/${id(food)}`),
    )

    expect(remaining.item.quantity).toBe(2)
    expect(remaining.item.weightKg).toBeCloseTo(0.5)

    const completed = await json(
      await context.request.get(`/api/rescue/${listingId}`),
    )

    expect(completed.listing.status).toBe('collected')
  } finally {
    await neighbour.close()
  }
})

test('owner cannot request their own food and another user cannot edit it', async ({
  context,
  browser,
  baseURL,
  member,
}) => {
  const { listing } = await createListing(
    context,
    listingData(`E2E boundary ${Date.now()}`),
  )

  const ownRequest = await context.request.post(
    `/api/rescue/${id(listing)}/claim`,
    {
      data: {
        pickupStart: listing.pickupStart,
        pickupEnd: listing.pickupEnd,
      },
    },
  )

  expect(ownRequest.status()).toBe(400)

  const stranger = await browser.newContext({ baseURL })

  try {
    await signIn(stranger, ALICE)

    const edit = await stranger.request.patch(
      `/api/rescue/${id(listing)}`,
      {
        data: { title: 'Unauthorised change' },
      },
    )

    expect([403, 404]).toContain(edit.status())

    const unchanged = await json(
      await context.request.get(`/api/rescue/${id(listing)}`),
    )

    expect(unchanged.listing.title).toBe(listing.title)
  } finally {
    await stranger.close()
  }
})

test('post linked food from the editor using the saved pickup address', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)

  // A previous listing saves the preferred address.
  const previous = await createListing(
    context,
    listingData(`E2E address setup ${Date.now()}`),
  )

  await json(
    await context.request.delete(
      `/api/rescue/${id(previous.listing)}`,
    ),
  )

  await page.goto('/food-rescue')

  await page.getByRole('button', {
    name: 'Share food',
    exact: true,
  }).click()

  const editor = page.getByRole('dialog', {
    name: 'Share something good',
    exact: true,
  })

  await editor.locator('.food-choice').filter({
    hasText: food.name,
  }).click()

  await editor.locator('#share-picker-quantity').fill('2')

  await editor.getByRole('button', {
    name: 'Continue →',
    exact: true,
  }).click()

  await editor.getByRole('button', {
    name: 'Tomorrow',
    exact: true,
  }).click()

  await editor.getByRole('button', {
    name: /Afternoon/,
  }).click()

  await expect(editor.getByText(
    'Your usual pickup address',
    { exact: true },
  )).toBeVisible()

  const posted = waitForEndpoint(page, '/api/rescue')

  await editor.getByRole('button', {
    name: 'Post listing',
    exact: true,
  }).click()

  const { listing } = await json(await posted, 201)
  trackListing(context, listing)

  expect(listing.title).toBe(food.name)
  expect(listing.quantity).toBe(2)
  expect(listing.pickupLabel).toContain('Victoria Street')

  const mine = await json(
    await context.request.get('/api/rescue/mine'),
  )

  expect(
    mine.listings.some(item => id(item) === id(listing)),
  ).toBe(true)
})

test('search OneMap and choose a real pickup address', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)

  await page.goto('/food-rescue')

  await page.getByRole('button', {
    name: 'Share food',
    exact: true,
  }).click()

  const editor = page.getByRole('dialog', {
    name: 'Share something good',
    exact: true,
  })

  await editor.locator('.food-choice').filter({
    hasText: food.name,
  }).click()

  await editor.getByRole('button', {
    name: 'Continue →',
    exact: true,
  }).click()

  await editor.locator('#pickup-address-search').fill('188065')

  const search = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/locations/search' &&
    response.request().method() === 'GET'
  )

  await editor.getByRole('button', {
    name: 'Search',
    exact: true,
  }).click()

  const data = await json(await search)
  expect(data.addresses.length).toBeGreaterThan(0)

  await editor.locator('.address-result').first().click()

  await expect(editor.getByText(
    'Selected meeting point',
    { exact: true },
  )).toBeVisible()
})

test('owner declines a request without removing inventory', async ({
  page,
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  const dialog = await openThread(page, 'received', food.name)

  const declined = waitForEndpoint(
    page,
    `/api/rescue/requests/${id(request)}/decline`,
  )

  await dialog.getByRole('button', {
    name: 'Decline request',
    exact: true,
  }).click()

  await expectSuccess(declined)

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('declined')

  expect(
    (await listingState(context, listing)).status,
  ).toBe('available')

  await assertInventory(context, food, 4, 1)
})

test('requester cancels a pending request without removing inventory', async ({
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  const dialog = await openThread(
    rescue.alice.page,
    'sent',
    food.name,
  )

  const cancelled = waitForEndpoint(
    rescue.alice.page,
    `/api/rescue/requests/${id(request)}/cancel`,
  )

  await dialog.getByRole('button', {
    name: 'Cancel request',
    exact: true,
  }).click()

  await expectSuccess(cancelled)

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('cancelled')

  expect(
    (await listingState(context, listing)).status,
  ).toBe('available')

  await assertInventory(context, food, 4, 1)
})

test('cancelling an accepted pickup releases the reservation', async ({
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  await requestAction(context, request, 'accept')

  const dialog = await openThread(
    rescue.alice.page,
    'sent',
    food.name,
  )

  const cancelled = waitForEndpoint(
    rescue.alice.page,
    `/api/rescue/requests/${id(request)}/cancel`,
  )

  await dialog.getByRole('button', {
    name: 'Cancel pickup',
    exact: true,
  }).click()

  await expectSuccess(cancelled)

  const released = await listingState(context, listing)

  expect(released.status).toBe('available')
  expect(released.acceptedRequest).toBeFalsy()
  expect(released.claimedBy).toBeFalsy()

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('cancelled')

  await assertInventory(context, food, 4, 1)
})

test('withdraw a listing while keeping its linked inventory', async ({
  page,
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  const { row } = await openMyListing(page, food.name)

  await row.getByRole('button', {
    name: 'Withdraw',
    exact: true,
  }).click()

  const confirmation = page.getByRole('dialog', {
    name: `Withdraw ${food.name}?`,
    exact: true,
  })

  const withdrawn = waitForEndpoint(
    page,
    `/api/rescue/${id(listing)}`,
    'DELETE',
  )

  await confirmation.getByRole('button', {
    name: 'Withdraw listing',
    exact: true,
  }).click()

  await expectSuccess(withdrawn)

  expect(
    (await listingState(context, listing)).status,
  ).toBe('withdrawn')

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('declined')

  await assertInventory(context, food, 4, 1)

  const cards = await showNearby(rescue.alice, food.name)
  await expect(cards).toHaveCount(0)
})

test('[API] duplicate requests do not create another active request', async ({
  context,
  rescue,
}) => {
  const { listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  const duplicate = await rescue.alice.context.request.post(
    `/api/rescue/${id(listing)}/claim`,
    {
      data: {
        pickupStart: listing.pickupStart,
        pickupEnd: listing.pickupEnd,
      },
    },
  )

  expect(duplicate.status()).toBe(409)

  const result = await json(
    await context.request.get('/api/rescue/requests', {
      params: {
        direction: 'received',
        listing: id(listing),
        limit: 50,
      },
    }),
  )

  expect(result.total).toBe(1)
  expect(id(result.requests[0])).toBe(id(request))
})

test('[API] competing requests cannot both reserve the same listing', async ({
  context,
  rescue,
}) => {
  const { food, listing, request: first } = await setupPickup(
    context,
    rescue.alice,
  )

  const thirdUser = await rescue.newActor()
  const second = await claim(thirdUser, listing)

  // Send both acceptance requests concurrently.
  const responses = await Promise.all([
    context.request.post(
      `/api/rescue/requests/${id(first)}/accept`,
    ),
    context.request.post(
      `/api/rescue/requests/${id(second)}/accept`,
    ),
  ])

  const statuses = responses.map(response => response.status()).sort()
  expect(statuses).toEqual([200, 409])

  const reserved = await listingState(context, listing)

  expect(reserved.status).toBe('claimed')

  expect([id(first), id(second)])
    .toContain(id(reserved.acceptedRequest))

  const requests = [
    await requestState(context, listing, first),
    await requestState(context, listing, second),
  ]

  expect(
    requests.filter(request => request.status === 'accepted'),
  ).toHaveLength(1)

  await assertInventory(context, food, 4, 1)
})

test('collecting the entire shared quantity removes the inventory item', async ({
  page,
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
    { quantity: 4 },
  )

  await requestAction(context, request, 'accept')

  const dialog = await openThread(page, 'received', food.name)

  await dialog.getByRole('button', {
    name: 'Confirm collection',
    exact: true,
  }).click()

  const confirmation = page.getByRole('dialog', {
    name: 'Has the food been collected?',
    exact: true,
  })

  const collected = waitForEndpoint(
    page,
    `/api/rescue/${id(listing)}/collect`,
  )

  await confirmation.getByRole('button', {
    name: 'Yes, collected',
    exact: true,
  }).click()

  await expectSuccess(collected)

  expect(
    (await context.request.get(
      `/api/inventory/${id(food)}`,
    )).status(),
  ).toBe(404)

  expect(
    (await listingState(context, listing)).status,
  ).toBe('collected')

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('completed')

  // Repeating confirmation must not deduct inventory again.
  const repeated = await json(
    await context.request.post(
      `/api/rescue/${id(listing)}/collect`,
    ),
  )

  expect(repeated.alreadyCollected).toBe(true)
})

test('[API] changed inventory prevents collection without further deduction', async ({
  context,
  rescue,
}) => {
  const { food, listing, request } = await setupPickup(
    context,
    rescue.alice,
  )

  await requestAction(context, request, 'accept')

  await json(
    await context.request.patch(`/api/inventory/${id(food)}`, {
      data: {
        name: `${food.name} changed after posting`,
      },
    }),
  )

  const response = await context.request.post(
    `/api/rescue/${id(listing)}/collect`,
  )

  expect(response.status()).toBe(409)

  await assertInventory(context, food, 4, 1)

  expect(
    (await listingState(context, listing)).status,
  ).toBe('claimed')

  expect(
    (await requestState(context, listing, request)).status,
  ).toBe('accepted')
})

const proposalDecisions = [
  {
    action: 'accept',
    description: 'accepted',
    button: 'Agree to this time',
  },
  {
    action: 'decline',
    description: 'declined',
    button: 'Keep previous time',
  },
  {
    action: 'withdraw',
    description: 'withdrawn',
    button: 'Withdraw suggestion',
  },
]

for (const decision of proposalDecisions) {
  test(`pickup time suggestion can be ${decision.description}`, async ({
    page,
    context,
    rescue,
  }) => {
    const { food, listing, request } = await setupPickup(
      context,
      rescue.alice,
    )

    const window = proposedWindow()
    const ownerDialog = await openThread(page, 'received', food.name)

    await ownerDialog.getByRole('button', {
      name: 'Suggest another time',
      exact: true,
    }).click()

    await ownerDialog.locator('#proposal-start')
      .fill(window.localStart)

    await ownerDialog.locator('#proposal-end')
      .fill(window.localEnd)

    const proposed = waitForEndpoint(
      page,
      `/api/rescue/requests/${id(request)}/pickup-proposal`,
    )

    await ownerDialog.getByRole('button', {
      name: 'Send time suggestion',
      exact: true,
    }).click()

    await expectSuccess(proposed)

    const responder = decision.action === 'withdraw'
      ? page
      : rescue.alice.page

    const dialog = decision.action === 'withdraw'
      ? ownerDialog
      : await openThread(responder, 'sent', food.name)

    const decided = waitForEndpoint(
      responder,
      `/api/rescue/requests/${id(request)}/pickup-proposal/${decision.action}`,
    )

    await dialog.getByRole('button', {
      name: decision.button,
      exact: true,
    }).click()

    await expectSuccess(decided)

    const updated = await requestState(context, listing, request)

    expect(updated.pickupProposal).toBeFalsy()
    expect(updated.status).toBe('pending')

    expect(new Date(updated.pickupStart).toISOString()).toBe(
      decision.action === 'accept'
        ? window.pickupStart
        : new Date(listing.pickupStart).toISOString(),
    )

    expect(new Date(updated.pickupEnd).toISOString()).toBe(
      decision.action === 'accept'
        ? window.pickupEnd
        : new Date(listing.pickupEnd).toISOString(),
    )

    // Agreeing a time does not reserve the food.
    expect(
      (await listingState(context, listing)).status,
    ).toBe('available')
  })
}

test('edit a listing and show the changed description to a neighbour', async ({
  page,
  context,
  rescue,
}) => {
  const title = uniqueName('editable listing')

  const { listing } = await createListing(
    context,
    listingData(title),
  )

  const editor = await openListingEditor(page, title)
  const description = 'Updated description from the E2E test.'

  await editor.locator('#listing-description').fill(description)

  const changed = waitForEndpoint(
    page,
    `/api/rescue/${id(listing)}`,
    'PATCH',
  )

  await editor.getByRole('button', {
    name: /^Save changes$/i,
  }).click()

  await expectSuccess(changed)

  const updated = await listingState(context, listing)
  expect(updated.description).toBe(description)

  const cards = await showNearby(rescue.alice, title)

  await expect(
    cards.filter({ hasText: title }),
  ).toContainText(description)
})

test('cancelling the editor creates no listing and preserves inventory', async ({
  page,
  context,
  rescue,
}) => {
  const food = await seedFood(context)

  const before = await json(
    await context.request.get('/api/rescue/mine'),
  )

  await page.goto('/food-rescue')

  await page.getByRole('button', {
    name: 'Share food',
    exact: true,
  }).click()

  const editor = page.getByRole('dialog', {
    name: 'Share something good',
    exact: true,
  })

  await editor.locator('.food-choice').filter({
    hasText: food.name,
  }).click()

  await editor.getByRole('button', {
    name: 'Continue →',
    exact: true,
  }).click()

  await editor.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(editor).not.toBeVisible()

  const after = await json(
    await context.request.get('/api/rescue/mine'),
  )

  expect(after.total).toBe(before.total)
  await assertInventory(context, food, 4, 1)
})

test('inventory picker rejects invalid share quantities', async ({
  page,
  context,
  rescue,
}) => {
  const food = await seedFood(context)

  await page.goto('/food-rescue')

  await page.getByRole('button', {
    name: 'Share food',
    exact: true,
  }).click()

  const editor = page.getByRole('dialog', {
    name: 'Share something good',
    exact: true,
  })

  await editor.locator('.food-choice').filter({
    hasText: food.name,
  }).click()

  const quantity = editor.locator('#share-picker-quantity')

  const next = editor.getByRole('button', {
    name: 'Continue →',
    exact: true,
  })

  for (const value of ['0', '5', '1.5']) {
    await quantity.fill(value)
    await expect(next).toBeDisabled()
  }

  await quantity.fill('2')
  await expect(next).toBeEnabled()

  await editor.getByRole('button', {
    name: 'Close listing editor',
    exact: true,
  }).click()

  await assertInventory(context, food, 4, 1)
})

const invalidListings = [
  {
    name: 'zero quantity',
    change: data => ({
      ...data,
      quantity: 0,
    }),
  },
  {
    name: 'quantity exceeding inventory',
    change: data => ({
      ...data,
      quantity: 5,
    }),
  },
  {
    name: 'fractional quantity',
    change: data => ({
      ...data,
      quantity: 1.5,
    }),
  },
  {
    name: 'reversed pickup times',
    change: data => ({
      ...data,
      pickupStart: data.pickupEnd,
      pickupEnd: data.pickupStart,
    }),
  },
  {
    name: 'pickup ending after expiry',
    change: data => ({
      ...data,
      pickupEnd: new Date(
        Date.parse(data.expiresAt) + 3600000,
      ).toISOString(),
    }),
  },
  {
    name: 'past expiry',
    change: data => ({
      ...data,
      expiresAt: '2000-01-01T00:00:00.000Z',
    }),
  },
]

for (const scenario of invalidListings) {
  test(`[API] reject a listing with ${scenario.name}`, async ({
    context,
    rescue,
  }) => {
    const food = await seedFood(context)

    const before = await json(
      await context.request.get('/api/rescue/mine'),
    )

    const data = listingData(food.name, id(food))

    const response = await context.request.post('/api/rescue', {
      data: scenario.change(data),
    })

    expect(response.status()).toBe(400)

    const after = await json(
      await context.request.get('/api/rescue/mine'),
    )

    expect(after.total).toBe(before.total)
    await assertInventory(context, food, 4, 1)
  })
}

test('[API] requested pickup must end after it starts and before expiry', async ({
  context,
  rescue,
}) => {
  const { listing } = await createListing(
    context,
    listingData(uniqueName('invalid request window')),
  )

  const invalidWindows = [
    {
      pickupStart: listing.pickupEnd,
      pickupEnd: listing.pickupStart,
    },
    {
      pickupStart: listing.pickupStart,
      pickupEnd: new Date(
        Date.parse(listing.expiresAt) + 3600000,
      ).toISOString(),
    },
  ]

  for (const window of invalidWindows) {
    const response = await rescue.alice.context.request.post(
      `/api/rescue/${id(listing)}/claim`,
      { data: window },
    )

    expect(response.status()).toBe(400)
  }

  const requests = await json(
    await context.request.get('/api/rescue/requests', {
      params: {
        direction: 'received',
        listing: id(listing),
      },
    }),
  )

  expect(requests.total).toBe(0)
})

test('nearby search and category filters show matching food', async ({
  context,
  rescue,
}) => {
  const prefix = uniqueName('browse')

  const { listing: produce } = await createListing(context, {
    ...listingData(`${prefix} apples`),
    category: 'produce',
  })

  const { listing: bakery } = await createListing(context, {
    ...listingData(`${prefix} bread`),
    category: 'bakery',
  })

  const cards = await showNearby(rescue.alice, prefix)
  await expect(cards).toHaveCount(2)

  const page = rescue.alice.page

  const category = page.locator(
    '#explore-map .explore-filters select',
  ).nth(0)

  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url())

    return (
      url.pathname.replace(/\/$/, '') === '/api/rescue' &&
      url.searchParams.get('q') === prefix &&
      url.searchParams.get('category') === 'bakery'
    )
  })

  await category.selectOption('bakery')
  await expectSuccess(filtered)

  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(bakery.title)

  await expect(
    cards.filter({ hasText: produce.title }),
  ).toHaveCount(0)

  const searched = await showNearby(rescue.alice, produce.title)

  await expect(searched).toHaveCount(1)
  await expect(searched.first()).toContainText(produce.title)
})

test('nearby excludes own, withdrawn and reserved listings', async ({
  page,
  context,
  rescue,
}) => {
  const prefix = uniqueName('availability')

  const { listing: available } = await createListing(
    context,
    listingData(`${prefix} available`),
  )

  const { listing: withdrawn } = await createListing(
    context,
    listingData(`${prefix} withdrawn`),
  )

  await json(
    await context.request.delete(
      `/api/rescue/${id(withdrawn)}`,
    ),
  )

  const { listing: reserved } = await createListing(
    context,
    listingData(`${prefix} reserved`),
  )

  const request = await claim(rescue.alice, reserved)
  await requestAction(context, request, 'accept')

  const cards = await showNearby(rescue.alice, prefix)

  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(available.title)

  await expect(
    cards.filter({ hasText: withdrawn.title }),
  ).toHaveCount(0)

  await expect(
    cards.filter({ hasText: reserved.title }),
  ).toHaveCount(0)

  // Bob must not see his own listings offered for collection.
  const ownCards = await showNearby({ page, context }, prefix)
  await expect(ownCards).toHaveCount(0)
})

test('expired food disappears from nearby results', async ({
  context,
  rescue,
}) => {
  const expiresAt = new Date(Date.now() + 30_000).toISOString()

  const { listing } = await createListing(context, {
    ...listingData(uniqueName('expiring listing')),
    pickupStart: new Date(Date.now() + 1000).toISOString(),
    pickupEnd: expiresAt,
    expiresAt,
  })

  // Wait for the real backend to stop offering the listing.
  await expect.poll(async () => {
    const result = await json(
      await rescue.alice.context.request.get('/api/rescue', {
        params: { q: listing.title },
      }),
    )

    return result.listings.some(item => id(item) === id(listing))
  }, {
    message: 'The expired listing should leave nearby results',
    timeout: 60_000,
    intervals: [1000, 2000],
  }).toBe(false)

  expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(expiresAt))

  const cards = await showNearby(rescue.alice, listing.title)
  await expect(cards).toHaveCount(0)
})

test('unread messages show a dot and move the conversation to the top', async ({
  page,
  context,
  rescue,
}) => {
  const third = await rescue.newActor()
  const prefix = uniqueName('inbox ordering')

  const { listing: aliceListing } = await createListing(
    context,
    listingData(`${prefix} Alice`),
  )

  const { listing: thirdListing } = await createListing(
    context,
    listingData(`${prefix} third user`),
  )

  const aliceRequest = await claim(rescue.alice, aliceListing)
  const thirdRequest = await claim(third, thirdListing)

  await sendMessage(
    third,
    thirdRequest,
    'Earlier conversation message',
  )

  const dialog = await openThread(
    page,
    'received',
    thirdListing.title,
  )

  await expect(dialog.locator('.message-list'))
    .toContainText('Earlier conversation message')

  // Show only these two test conversations.
  await dialog.getByRole('searchbox', {
    name: 'Find food or a neighbour',
  }).fill(prefix)

  await expect(dialog.locator('.group-heading')).toHaveCount(2)

  await page.bringToFront()

  const latestText = `Newest message ${clientKey()}`
  await sendMessage(rescue.alice, aliceRequest, latestText)

  const aliceGroup = dialog.locator('.item-group').filter({
    has: page.locator('.group-heading').filter({
      hasText: rescue.alice.user.name,
    }),
  })

  const heading = aliceGroup.locator('.group-heading')
  const dot = heading.locator('.rescue-unread-dot')

  await expect(dot).toBeVisible({ timeout: 30_000 })

  await expect(dialog.locator('.group-heading').first())
    .toContainText(rescue.alice.user.name, { timeout: 30_000 })

  if (await heading.getAttribute('aria-expanded') === 'false') {
    await heading.click()
  }

  await aliceGroup.locator('.request-person').filter({
    hasText: aliceListing.title,
  }).click()

  await expect(dialog.locator('.message-list'))
    .toContainText(latestText)

  await expect(dot).toHaveCount(0)
})

for (const status of ['cancelled', 'completed']) {
  test(`${status} conversations appear in history with replies disabled`, async ({
    page,
    context,
    rescue,
  }) => {
    const { food, listing, request } = await setupPickup(
      context,
      rescue.alice,
    )

    if (status === 'completed') {
      await requestAction(context, request, 'accept')

      await json(
        await context.request.post(
          `/api/rescue/${id(listing)}/collect`,
        ),
      )
    } else {
      await requestAction(context, request, 'cancel')
    }

    const dialog = await openThread(page, 'received', food.name)

    const past = dialog.locator('.conversation-section').filter({
      has: page.locator('summary').filter({
        hasText: 'Past conversations',
      }),
    })

    await expect(
      past.locator('.request-person').filter({
        hasText: food.name,
      }),
    ).toBeVisible()

    await expect(
      dialog.getByLabel('Write a reply', { exact: true }),
    ).toBeDisabled()

    // The server must reject replies too.
    const response = await context.request.post(
      `/api/rescue/requests/${id(request)}/messages`,
      {
        data: {
          text: 'This should not be sent',
          clientMessageId: clientKey(),
        },
      },
    )

    expect(response.status()).toBe(409)
  })
}

test('upload a listing photo and display it to a neighbour', async ({
  page,
  context,
  rescue,
}) => {
  const title = uniqueName('photo listing')

  const { listing } = await createListing(
    context,
    listingData(title),
  )

  const editor = await openListingEditor(page, title)

  const imagePath = fileURLToPath(
    new URL('./fixtures/receipt.jpg', import.meta.url),
  )

  await editor.locator('#listing-photo').setInputFiles(imagePath)

  await expect(editor.getByAltText(
    'Selected food photo preview',
    { exact: true },
  )).toBeVisible()

  const photoSaved = waitForEndpoint(
    page,
    `/api/rescue/${id(listing)}/photo`,
    'PUT',
  )

  await editor.getByRole('button', {
    name: /^Save changes$/i,
  }).click()

  await expectSuccess(photoSaved)

  const updated = await listingState(context, listing)
  expect(updated.hasPhoto).toBe(true)

  const imageResponse = await context.request.get(
    `/api/rescue/${id(listing)}/photo`,
  )

  expect(imageResponse.status()).toBe(200)

  expect(
    imageResponse.headers()['content-type'],
  ).toMatch(/^image\//)

  const cards = await showNearby(rescue.alice, title)

  const image = cards.filter({
    hasText: title,
  }).locator('.food-photo')

  await expect(image).toBeVisible()

  await expect.poll(
    () => image.evaluate(element => element.naturalWidth),
  ).toBeGreaterThan(0)
})