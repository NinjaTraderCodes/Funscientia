/** Resolve a path inside public/assets against the deployed base URL. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
