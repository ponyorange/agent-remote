export function enqueueConfirmation<TItem>(items: TItem[], item: TItem): TItem[] {
  return [...items, item];
}

export function dequeueConfirmation<TItem>(items: TItem[]): { current: TItem | undefined; remaining: TItem[] } {
  const [current, ...remaining] = items;
  return { current, remaining };
}
