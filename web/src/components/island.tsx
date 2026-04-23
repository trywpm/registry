import type { Child } from 'hono/jsx';

type IslandProps = {
  name: string;
  children: Child | Child[];
};

export const Island = ({ name, children }: IslandProps) => {
  return (
    <>
      {import.meta.env.DEV ? (
        <script
          type="module"
          src={`/src/components/${name}/${name}.island.ts?v=${Date.now()}`}
        ></script>
      ) : (
        <script type="module" src={`/dist/${name}.js?v=${Date.now()}`}></script>
      )}
      {children}
    </>
  );
};
