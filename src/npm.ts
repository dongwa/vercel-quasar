import { BuildConfig } from './config';
import { Meta, runNpmInstall, runPackageJsonScript } from '@vercel/build-utils';
import path from 'path';

export async function npmBuild(
  config: BuildConfig,
  entrypointDir: string,
  spawnOpts: any,
  meta: Meta
) {
  const distDir = path.join(entrypointDir, config.dist);
  await runNpmInstall(entrypointDir, ['--prefer-offline'], spawnOpts, meta);
  await runPackageJsonScript(entrypointDir, 'build', spawnOpts);
  await runNpmInstall(
    distDir,
    ['--prefer-offline', '--production'],
    spawnOpts,
    meta
  );
}
