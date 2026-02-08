/**
 * Merges multiple AsyncGenerators into a single AsyncGenerator.
 * Yields values from all generators as they become available.
 * Completes when all generators are finished.
 * Returns a map of the final values returned by each generator.
 */
export async function* mergeGenerators<
  YieldType,
  ReturnMap extends Record<string, any>,
>(generators: { [K in keyof ReturnMap]: AsyncGenerator<YieldType, ReturnMap[K]> }): AsyncGenerator<
  YieldType,
  ReturnMap
> {
  const results = {} as ReturnMap
  const activeGenerators = new Map<keyof ReturnMap, AsyncGenerator<YieldType, any>>(
    Object.entries(generators) as any,
  )

  const pendingPromises = new Map<
    keyof ReturnMap,
    Promise<{ key: keyof ReturnMap; res: IteratorResult<YieldType, any> }>
  >()

  const getNext = (key: keyof ReturnMap) => {
    const gen = activeGenerators.get(key)!
    const promise = gen.next().then((res) => ({ key, res }))
    pendingPromises.set(key, promise)
  }

  for (const key of activeGenerators.keys()) {
    getNext(key)
  }

  while (activeGenerators.size > 0) {
    const { key, res } = await Promise.race(Array.from(pendingPromises.values()))

    if (res.done) {
      results[key] = res.value
      activeGenerators.delete(key)
      pendingPromises.delete(key)
    } else {
      yield res.value
      getNext(key)
    }
  }

  return results
}
