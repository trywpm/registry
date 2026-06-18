import { Hono } from 'hono';

const homeRoute = new Hono<AppEnv>();

homeRoute.get('/', async (c) => (await import('@/pages/home')).HomePage(c));
homeRoute.get('/plugins', async (c) => (await import('@/pages/plugins')).PluginsPage(c));
homeRoute.get('/themes', async (c) => (await import('@/pages/themes')).ThemesPage(c));
homeRoute.get('/docs', async (c) => (await import('@/pages/docs')).DocsPage(c));
homeRoute.get('/privacy', async (c) => (await import('@/pages/privacy')).PrivacyPolicyPage(c));
homeRoute.get('/terms', async (c) => (await import('@/pages/terms')).TermsOfServicePage(c));
homeRoute.get('/search', async (c) => (await import('@/pages/search')).SearchPage(c));
homeRoute.get('/waitlist', async (c) => (await import('@/pages/waitlist')).WaitlistPage(c));
homeRoute.get('/login', async (c) => (await import('@/pages/login')).LoginPage(c));
homeRoute.get('/signup', async (c) => (await import('@/pages/signup')).SignUpPage(c));

export default homeRoute;
