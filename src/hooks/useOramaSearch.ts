import { useCallback, useEffect, useRef, useState } from 'react';
import { Orama, Results, create, insert, search } from '@orama/orama';

type OramaSchemaDefinition = Record<string, 'string' | 'string[]' | 'number' | 'boolean'>;

export type OramaSearchResult<T> = {
  id: string;
  score: number;
  document: T;
};

export interface UseOramaSearchOptions {
  threshold?: number;
  tolerance?: number;
  limit?: number;
  properties?: string[];
  boost?: Record<string, number>;
}

export interface UseOramaSearchResult<T> {
  query: (term: string, options?: UseOramaSearchOptions) => Promise<OramaSearchResult<T>[]>;
  isReady: boolean;
}

function useOramaSearch<T extends Record<string, unknown>>(data: T[] | undefined, schema: OramaSchemaDefinition): UseOramaSearchResult<T> {
  const dbRef = useRef<Orama<typeof schema> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const schemaRef = useRef(schema);

  useEffect(() => {
    let cancelled = false;

    const buildIndex = async () => {
      if (!data || data.length === 0) {
        dbRef.current = null;
        setIsReady(false);
        return;
      }

      setIsReady(false);
      const db = create({ schema: schemaRef.current });
      const insertions = data.map((entry) => insert(db, entry as never));
      await Promise.all(insertions);

      if (!cancelled) {
        dbRef.current = db;
        setIsReady(true);
      }
    };

    buildIndex();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const query = useCallback(
    async (term: string, options?: UseOramaSearchOptions): Promise<OramaSearchResult<T>[]> => {
      if (!dbRef.current) {
        return [];
      }

      const results: Results<T> = await search(dbRef.current, {
        term,
        threshold: options?.threshold ?? 0.5,
        tolerance: options?.tolerance ?? 1.5,
        limit: options?.limit ?? 10,
        ...(options?.properties ? { properties: options.properties } : {}),
        ...(options?.boost ? { boost: options.boost } : {}),
      });

      return results.hits.map((hit) => ({
        id: String(hit.id),
        score: hit.score,
        document: hit.document as T,
      }));
    },
    [isReady]
  );

  return { query, isReady };
}

export default useOramaSearch;
