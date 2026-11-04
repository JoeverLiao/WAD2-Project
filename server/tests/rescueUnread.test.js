import { test, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import communication from '../controllers/rescueCommunicationController.js'
import Request from '../models/rescueRequestModel.js'
import Message from '../models/rescueMessageModel.js'
afterEach(() => mock.restoreAll())
test('unread count scopes conversations to the current user and excludes their own/read messages', async () => {
  const userId = '507f1f77bcf86cd799439012'
  mock.method(Request, 'find', query => {
    assert.deepEqual(query, { $or: [{ owner: userId }, { requester: userId }] })
    return { select: () => ({ lean: async () => [
      { _id: 'one', requester: 'other', message: 'Hello' },
      { _id: 'two', requester: 'other', message: 'Read', initialReadBy: [userId] },
    ] }) }
  })
  mock.method(Message, 'countDocuments', async query => {
    assert.deepEqual(query.sender, { $ne: userId })
    assert.deepEqual(query.readBy, { $ne: userId })
    assert.deepEqual(query.request, { $in: ['one', 'two'] })
    return 3
  })
  let result
  await communication.unreadCount({ userId }, { json: data => { result = data } }, error => { throw error })
  assert.equal(result.count, 4)
})
