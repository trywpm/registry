import { Hono } from 'hono';

import { HomePage } from '@/pages/home';
import { DocsPage } from '@/pages/docs';
import { LoginPage } from '@/pages/login';
import { SearchPage } from '@/pages/search';
import { SignUpPage } from '@/pages/signup';
import { ThemesPage } from '@/pages/themes';
import { PluginsPage } from '@/pages/plugins';
import { WaitlistPage } from '@/pages/waitlist';
import { PrivacyPolicyPage } from '@/pages/privacy';
import { TermsOfServicePage } from '@/pages/terms';

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

homeRoute.get('/docs', (c) => {
  return DocsPage(c);
});

homeRoute.get('/privacy', (c) => {
  return PrivacyPolicyPage(c);
});

homeRoute.get('/terms', (c) => {
  return TermsOfServicePage(c);
});

homeRoute.get('/search', (c) => {
  return SearchPage(c);
});

homeRoute.get('/waitlist', (c) => {
  return WaitlistPage(c);
});

homeRoute.get('/login', (c) => {
  return LoginPage(c);
});

homeRoute.get('/signup', (c) => {
  return SignUpPage(c);
});

export default homeRoute;
