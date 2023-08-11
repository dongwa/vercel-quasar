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

  let distDir = 'dist/ssr';
  try {
    // Get quasar directory
    const entrypointDirname = path.dirname(entrypoint);
    // Get quasar path
    const entrypointPath = path.join(workPath, entrypointDirname);
    console.log('entrypointPath', entrypointPath);
    const conf = getQuasarConfig(entrypointPath);

    distDir = conf.build.distDir;
  } catch (error) {
    consola.error(error);
  }

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
