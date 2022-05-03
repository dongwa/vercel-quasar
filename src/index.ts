import {
  BuildOptions,
  download,
  getNodeVersion,
  getSpawnOptions,
} from '@vercel/build-utils';
import path from 'path';
import { getConfig } from './config';
import { getMountPoint } from './utils';
import { npmBuild } from './npm';

export async function build({
  files,
  entrypoint,
  workPath,
  config: rawConfig,
  meta = {},
}: BuildOptions) {
  try {
    const mountpoint = getMountPoint(entrypoint);
    const entrypointDir = path.join(workPath, mountpoint);
    await download(files, workPath, meta);

    process.chdir(entrypointDir);

    const config = getConfig(rawConfig);
    const nodeVersion = await getNodeVersion(entrypointDir, undefined, config);
    const spawnOpts = getSpawnOptions(meta, nodeVersion);
    await npmBuild(config, entrypointDir, spawnOpts, meta);
  } catch (error: any) {
    console.error('build err ===> ', error);
    console.error('build config ===> ', rawConfig);
  }
}
