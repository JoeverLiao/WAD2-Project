import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  withCredentials: true,
  timeout: 30_000,
});

export function apiError(
  error,
  fallback = "Something went wrong. Please try again.",
) {
  if (error.response?.status === 401) return "Please log in again to continue.";
  return error.response?.data?.error || error.message || fallback;
}
export const isCancelled = (error) => axios.isCancel(error);

export async function allPages(path, key, params = {}, signal) {
  const records = new Map();
  let page = 1;
  let pages = 1;
  do {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: 50 },
      signal,
    });
    if (!Array.isArray(data[key]))
      throw new Error("Unexpected server response. Check your rescue routes.");
    for (const record of data[key]) records.set(String(record._id), record);
    pages = Number(data.pages) || 0;
    page += 1;
  } while (page <= pages);
  return [...records.values()];
}

export function photoUrl(listing) {
  if (!listing?.hasPhoto) return "";
  const base = api.defaults.baseURL.replace(/\/$/, "");
  return `${base}/rescue/${listing._id}/photo?v=${encodeURIComponent(listing.updatedAt || "")}`;
}
