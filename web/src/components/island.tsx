import type { Child } from 'hono/jsx';

import { getAssetUrl } from '@/lib/utils';

type IslandProps = {
  name: string;
  children: Child | Child[];
};

export const Island = ({ name, children }: IslandProps) => {
  return (
    <>
      <script type="module" src={getAssetUrl(`/src/components/${name}/${name}.island.ts`)}></script>
      {children}
    </>
  );
};
