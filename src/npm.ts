import fs from 'fs-extra';
import os from 'os';
import { BuildConfig } from './config';
import { Meta, runNpmInstall, runPackageJsonScript } from '@vercel/build-utils';
import path from 'path';
import { globAndPrefix } from './utils';

export async function npmBuild(
  config: BuildConfig,
  entrypointDir: string,
  spawnOpts: any,
  meta: Meta
) {
  const distDir = path.join(entrypointDir, config.dist);
  await runNpmInstall(entrypointDir, ['--prefer-offline'], spawnOpts, meta);
  await runPackageJsonScript(entrypointDir, 'build', spawnOpts);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-quasar'));

  await fs.copy(
    path.join(entrypointDir, 'package.json'),
    path.join(tempDir, 'package.json')
  );

  process.chdir(tempDir);

  await runNpmInstall(
    tempDir,
    ['--prefer-offline', '--production'],
    spawnOpts,
    meta
  );
  return globAndPrefix(tempDir, 'node_modules');
}
