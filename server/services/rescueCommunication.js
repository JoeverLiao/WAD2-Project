import RescueMessage from "../models/rescueMessageModel.js";
// Store legacy initial text before any resubmission can overwrite it.
export async function storeInitialMessage(request, session) {
  if (request.initialMessageStored) return;
  if (request.message?.trim()) {
    await RescueMessage.create(
      [
        {
          request: request._id,
          sender: request.requester,
          readBy: request.initialReadBy || [],
          text: request.message,
          clientMessageId: `initial-${new Date(request.submittedAt || request.createdAt).toISOString()}`,
          createdAt: request.submittedAt || request.createdAt,
        },
      ],
      { session },
    );
  }
  request.initialMessageStored = true;
}
