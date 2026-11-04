import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "FoodListing",
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    message: { type: String, default: "", maxlength: 1000 },
    submittedAt: Date,
    initialReadBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    initialMessageStored: { type: Boolean, default: false },
    pickupProposal: {
      type: new Schema({
        proposedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        pickupStart: { type: Date, required: true },
        pickupEnd: { type: Date, required: true },
        clientProposalId: { type: String, required: true, maxlength: 80 },
        createdAt: { type: Date, default: Date.now },
      }),
      default: undefined,
    },
    pickupStart: { type: Date, required: true },
    pickupEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled", "completed"],
      default: "pending",
    },
    acceptedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);
// One conversation/request record per person and listing. Cancelled/declined requests can be resubmitted.
schema.index({ listing: 1, requester: 1 }, { unique: true });
schema.index({ owner: 1, updatedAt: -1 });
schema.index({ requester: 1, updatedAt: -1 });
export default mongoose.models.RescueRequest ||
  mongoose.model("RescueRequest", schema, "rescue_requests");
