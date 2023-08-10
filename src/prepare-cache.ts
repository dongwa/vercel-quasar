import path from 'path';
import consola from 'consola';
import { getQuasarConfig } from './utils';
import { startStep, endStep } from './utils';
import { PrepareCacheOptions, glob, Files } from '@vercel/build-utils';

async function prepareCache({
  workPath,
  entrypoint,
}: PrepareCacheOptions): Promise<Files> {
  startStep('Collect cache');

  const conf = getQuasarConfig(path.dirname(entrypoint));
  const distDir = conf.build.distDir;

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
