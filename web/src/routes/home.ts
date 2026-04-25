import { Hono } from 'hono';

import { HomePage } from '@/pages/home';
import { ThemesPage } from '@/pages/themes';
import { PluginsPage } from '@/pages/plugins';

const homeRoute = new Hono();

homeRoute.get('/', (c) => {
  return HomePage(c);
});

homeRoute.get('/plugins', (c) => {
  return PluginsPage(c);
});

homeRoute.get('/themes', (c) => {
  return ThemesPage(c);
});

export default homeRoute;
