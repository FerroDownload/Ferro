export type OptimisticResult<T> = {
  next: T;
  rollback: () => T;
};

export function applyOptimisticUpdate<T>(
  current: T,
  update: (current: T) => T,
): OptimisticResult<T> {
  const previous = current;
  const next = update(current);
  return {
    next,
    rollback: () => previous,
  };
}
