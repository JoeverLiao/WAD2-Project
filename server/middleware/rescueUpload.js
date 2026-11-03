import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
}).single("photo");
export default function rescueUpload(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    res
      .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Photo must be 8 MiB or smaller."
            : "Upload one file using the photo field, with no other form fields.",
      });
  });
}
