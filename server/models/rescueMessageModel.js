import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RescueRequest",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    // Client-generated key makes retries safe; the server always supplies sender.
    clientMessageId: { type: String, required: true, maxlength: 100 },
  },
  { timestamps: true },
);
schema.index({ request: 1, sender: 1, clientMessageId: 1 }, { unique: true });
schema.index({ request: 1, _id: 1 });
export default mongoose.models.RescueMessage ||
  mongoose.model("RescueMessage", schema, "rescue_messages");
