import type { Child } from 'hono/jsx';

type IslandProps = {
  name: string;
  children: Child | Child[];
};

export const Island = ({ name, children }: IslandProps) => {
  return (
    <>
      {children}
      <script type="module" src={`/dist/${name}.js?v=${Date.now()}`}></script>
    </>
  );
};
