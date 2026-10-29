const flagUrls = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byCode = new Map(
  Object.entries(flagUrls).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

export function flagUrl(code: string): string {
  const url = byCode.get(code);
  if (!url) throw new Error(`No flag for "${code}"`);
  return url;
}
