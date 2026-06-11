import { refreshSearchIndex } from '@wpm/d1/search';

export async function scheduler(controller: ScheduledController, env: Env) {
  if (controller.cron === '0 3 * * *') {
    await refreshSearchIndex(env.registry_search);
  }
}
