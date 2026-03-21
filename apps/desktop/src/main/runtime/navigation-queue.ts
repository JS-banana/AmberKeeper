export function createSerializedNavigationExecutor(
  navigate: (url: string) => Promise<unknown>
): (url: string) => Promise<void> {
  let pendingNavigation = Promise.resolve();

  return async (url: string) => {
    const nextNavigation = pendingNavigation.then(async () => {
      await navigate(url);
    });

    pendingNavigation = nextNavigation.catch(() => undefined);
    await nextNavigation;
  };
}
