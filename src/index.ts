import { BuildOptions, PrepareCacheOptions } from '@vercel/build-utils/dist';
import { build } from './build';
import config from './config';
import prepareCache from './prepare-cache';
import { QuasarConfiguration } from './utils';

export interface Context {
  quasarConfig?: QuasarConfiguration;
}

let context: Context = {
  quasarConfig: undefined,
};

module.exports = {
  version: 2,
  build: (options: BuildOptions) => {
    return build(options, context);
  },
  config,
  prepareCache: (options: PrepareCacheOptions) => {
    return prepareCache(options, context);
  },
};
