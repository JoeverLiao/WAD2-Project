export function notImplemented(feature) {
  return (_req, res) => {
    res.status(501).json({ error: 'Not implemented', feature })
  }
}
