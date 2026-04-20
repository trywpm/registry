import { Hono } from 'hono';

const app = new Hono();

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal server error' }, 500);
});

export default {
  fetch: app.fetch,
};
