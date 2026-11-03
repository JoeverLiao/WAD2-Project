import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    data: {
      type: Buffer,
      required: true,
      select: false,
      validate: {
        validator: (b) => b.length <= 200 * 1024,
        message: "Photo exceeds 200 KiB.",
      },
    },
    contentType: { type: String, enum: ["image/webp"], default: "image/webp" },
  },
  { timestamps: true },
);
export default mongoose.models.RescuePhoto ||
  mongoose.model("RescuePhoto", schema, "rescue_photos");
