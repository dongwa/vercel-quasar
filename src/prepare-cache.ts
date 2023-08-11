import consola from 'consola';
import { startStep, endStep } from './utils';
import { PrepareCacheOptions, glob, Files } from '@vercel/build-utils';

import type { Context } from '.';

async function prepareCache(
  { workPath }: PrepareCacheOptions,
  context: Context
): Promise<Files> {
  startStep('Collect cache');

  const quasarConfig = context.quasarConfig!;
  console.log('quasarConfig', quasarConfig);
  let distDir = quasarConfig?.build?.distDir || 'dist/ssr';

  console.log('distDir', distDir);

  const dirs =
    process.env.QUASAR_CACHE_DISABLED === '1'
      ? []
      : [distDir, '.vercel_cache', 'node_modules_dev', 'node_modules_prod'];

  const cache: Files = {};
  for (const dir of dirs) {
    const files = await glob(`**/${dir}/**`, workPath);
    consola.info(`${Object.keys(files).length} files collected from ${dir}`);
    Object.assign(cache, files);
  }
  endStep();

  return cache;
}

export default prepareCache;
