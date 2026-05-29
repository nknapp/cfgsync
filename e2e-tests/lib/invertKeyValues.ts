export function invertKeyValues<
  K extends string | number,
  V extends string | number,
>(input: Record<K, V>): Record<V, K> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [value, key]),
  ) as Record<V, K>;
}
