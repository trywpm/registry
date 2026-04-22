import { Hono } from 'hono';
import { HomePage } from '@/pages/home';

const homeRoute = new Hono();

homeRoute.get('/', (c) => {
  return c.html(HomePage(c));
});

export default homeRoute;
