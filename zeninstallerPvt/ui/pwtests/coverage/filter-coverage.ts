export function filterDependencyCoverage<T extends { url: string }>(entries: readonly T[]): T[] {
  return entries.filter(({ url }) => {
    if (!URL.canParse(url)) return true;
    const pathname = decodeURIComponent(new URL(url).pathname);
    return !pathname.split(/[\\/]/).some((segment) => segment.toLowerCase() === "node_modules");
  });
}
