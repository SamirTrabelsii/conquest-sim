const flagUrls = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byCode = new Map(
  Object.entries(flagUrls).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

// Loads and decodes every flag up front, so no frame is ever captured with a
// flag still missing (matters when rendering frame by frame).
export async function preloadFlags(): Promise<void> {
  await Promise.all(
    [...byCode.values()].map((url) => {
      const img = new Image();
      img.src = url;
      return img.decode().catch(() => undefined);
    }),
  );
}

export function flagUrl(code: string): string {
  const url = byCode.get(code);
  if (!url) throw new Error(`No flag for "${code}"`);
  return url;
}
