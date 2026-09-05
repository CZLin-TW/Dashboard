/** Demo tabs keep both mock state and existing UI caches separate from the live site. */
export function appStorage(): Storage {
  return document.documentElement.dataset.demo === "true" ? sessionStorage : localStorage;
}
