import {
  download,
  getNodeVersion,
  getSpawnOptions,
  BuildV2,
} from '@vercel/build-utils';
import path from 'path';
import { getConfig } from './config';
import { getMountPoint } from './utils';
import { npmBuild } from './npm';
export const build: BuildV2 = async ({
  files,
  entrypoint,
  workPath,
  config: rawConfig,
  meta = {},
}) => {
  try {
    const mountpoint = getMountPoint(entrypoint);
    const entrypointDir = path.join(workPath, mountpoint);
    await download(files, workPath, meta);

    process.chdir(entrypointDir);

    const config = getConfig(rawConfig);
    const nodeVersion = await getNodeVersion(entrypointDir, undefined, config);
    const spawnOpts = getSpawnOptions(meta, nodeVersion);
    const outputPath = await npmBuild(config, entrypointDir, spawnOpts, meta);
    console.log('build finished,the output path is:', outputPath);

    const routes = [
      {
        src: '/(.*)',
        dest: '/',
      },
    ];
    return {
      buildOutputVersion: 3,
      buildOutputPath: outputPath,
      routes,
    };
  } catch (error: any) {
    console.error('build err ===> ', error);
    console.error('build config ===> ', rawConfig);
    throw error;
  }
};
