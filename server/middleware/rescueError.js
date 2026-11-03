export default function rescueError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status && error.status >= 400 && error.status < 500)
    return res.status(error.status).json({ error: error.message });
  if (error.code === 11000)
    return res
      .status(409)
      .json({
        error:
          "This inventory item already has an active listing, or this request already exists.",
      });
  if (["ValidationError", "CastError"].includes(error.name))
    return res
      .status(400)
      .json({ error: "Invalid rescue data.", details: error.message });
  if (
    error.code === 20 ||
    /Transaction numbers are only allowed/.test(error.message)
  ) {
    return res
      .status(503)
      .json({
        error:
          "Rescue requires a MongoDB replica set. Use your Atlas connection or a local replica set.",
      });
  }
  console.error("Rescue API:", error);
  res.status(500).json({ error: "Unable to complete the rescue operation." });
}
