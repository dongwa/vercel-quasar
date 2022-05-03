import { BuildOptions } from '@vercel/build-utils';
export interface VercelQuasarSSRBuildOptions {
  build: boolean;
  dist: string;
  main: string;
}
export type BuildConfig = VercelQuasarSSRBuildOptions & BuildOptions['config'];

export function getConfig(rawConfig: BuildOptions['config']): BuildConfig {
  return {
    dist: './dist/quasar.dev',
    main: 'index.js',
    build: true,
    ...rawConfig,
  };
}
