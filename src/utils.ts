import path from 'path';
import { SpawnOptions } from 'child_process';

import { glob, Files, PackageJson } from '@vercel/build-utils';
import consola from 'consola';
import jiti from 'jiti';
import execa, { ExecaReturnValue } from 'execa';
import fs from 'fs-extra';

import type { IOptions } from 'glob';

export function getMountPoint(entrypoint: string) {
  const entrypointName = path.basename(entrypoint);
  if (entrypointName !== 'package.json') {
    throw new Error(
      'This builder requires a `package.json` file as its entrypoint.'
    );
  }

  return path.dirname(entrypoint);
}

type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U>
    ? Mutable<U>[]
    : Mutable<T[P]>;
};

export type MutablePackageJson = Mutable<PackageJson>;

export function exec(
  cmd: string,
  args: string[],
  { env, ...opts }: SpawnOptions = {}
): Promise<ExecaReturnValue> {
  args = args.filter(Boolean);

  consola.log('Running', cmd, ...args);
  const stdio = Array.isArray(opts.stdio)
    ? (opts.stdio.filter(Boolean) as Array<
        SpawnOptions['stdio'] extends Array<infer R>
          ? Array<NonNullable<R>>
          : never
      > as any)
    : opts.stdio;
  return execa('npx', [cmd, ...args], {
    stdout: process.stdout,
    stderr: process.stderr,
    preferLocal: false,
    env: {
      MINIMAL: '1',
      NODE_OPTIONS: '--max_old_space_size=3000',
      ...env,
    },
    ...(opts as any),
    stdio,
  });
}

/**
 * Read in a JSON file with support for UTF-16 fallback.
 */

export async function readJSON<T = unknown>(filename: string): Promise<T> {
  try {
    return await fs.readJSON(filename);
  } catch {
    return await fs.readJSON(filename, { encoding: 'utf16le' });
  }
}

/**
 * Validate if the entrypoint is allowed to be used
 */
export function validateEntrypoint(entrypoint: string): void {
  const filename = path.basename(entrypoint);

  if (
    ['package.json', 'quasar.config.js', 'quasr.config.ts'].includes(
      filename
    ) === false
  ) {
    throw new Error(
      'Specified "src" for "@quasar/vercel-builder" has to be "package.json", "quasar.config.js" or "quasar.config.ts"'
    );
  }
}

export function renameFiles(
  files: Files,
  renameFn: (fileName: string) => string
): Files {
  const newFiles: Files = {};
  for (const fileName in files) {
    newFiles[renameFn(fileName)] = files[fileName];
  }
  return newFiles;
}

export async function globAndRename(
  pattern: string,
  opts: IOptions | string,
  renameFn: (fileName: string) => string
): Promise<Files> {
  const files = await glob(pattern, opts);
  return renameFiles(files, renameFn);
}

export function globAndPrefix(
  pattern: string,
  opts: IOptions | string,
  prefix: string
): Promise<Files> {
  return globAndRename(pattern, opts, (name) => path.join(prefix, name));
}

let _step: string | undefined;
let _stepStartTime: [number, number] | undefined;

const dash = ' ----------------- ';

export function hrToMs(hr: [number, number]): number {
  const hrTime = process.hrtime(hr);
  return (hrTime[0] * 1e9 + hrTime[1]) / 1e6;
}

export function endStep(): void {
  if (!_step) {
    return;
  }
  if (_step && _stepStartTime) {
    consola.info(`${_step} took: ${hrToMs(_stepStartTime)} ms`);
  }
  _step = undefined;
  _stepStartTime = undefined;
}

export function startStep(step: string): void {
  endStep();
  consola.log(dash + step + dash);
  _step = step;
  _stepStartTime = process.hrtime();
}

export interface QuasarConfiguration {
  build: {
    distDir: string;
    ignorePublicFolder?: boolean;
    publicPath?: string;
    vueRouterMode?: 'hash' | 'history';
    vueRouterBase?: string;
    rebuildCache?: boolean;
    analyze?: boolean;
  };
  ssr: {
    pwa?: boolean;
    maxAge?: number;
    prodPort?: number;
    middlewares?: string[];
    ssrPwaHtmlFilename?: string;
    manualStoreSerialization?: boolean;
    manualStoreSsrContextInjection?: boolean;
    manualStoreHydration?: boolean;
    manualPostHydrationTrigger?: boolean;
  };
}

const defaultQuasarConfig: QuasarConfiguration = {
  build: {
    publicPath: '/',
    vueRouterMode: 'hash',
    distDir: 'dist/ssr',
  },
  ssr: {
    pwa: false,
    prodPort: 3000,
    ssrPwaHtmlFilename: 'offline.html',
  },
};

export const supportExt = ['.mjs', '.cjs', '.js', '.mts', '.ts'];
export const quasarConfigNameWithoutExt = 'quasar.config';

export function getQuasarConfigFileName(rootDir: string) {
  for (const ext of supportExt) {
    const fileName = `${quasarConfigNameWithoutExt}${ext}`;
    const p = path.join(rootDir, fileName);
    if (fs.existsSync(p)) return fileName;
  }
  throw new Error(`Can not read ${quasarConfigNameWithoutExt} from ${rootDir}`);
}

export function getQuasarConfig(rootDir: string): QuasarConfiguration {
  const load = jiti(rootDir);
  const quasarConfigfileName = getQuasarConfigFileName(rootDir);

  let quasarConfigModule = load(`./${quasarConfigfileName}`);
  if (quasarConfigModule.default)
    quasarConfigModule = quasarConfigModule.default;

  let quasarConfig = quasarConfigModule({
    dev: false,
    prod: true,
  });

  for (let key in defaultQuasarConfig.build) {
    if (!quasarConfig.build[key])
      quasarConfig.build[key] =
        defaultQuasarConfig.build[
          key as keyof typeof defaultQuasarConfig['build']
        ];
  }
  for (let key in defaultQuasarConfig.ssr) {
    if (!quasarConfig.ssr[key])
      quasarConfig.ssr[key] =
        defaultQuasarConfig.ssr[key as keyof typeof defaultQuasarConfig['ssr']];
  }
  return quasarConfig;
}

export async function prepareNodeModules(
  entrypointPath: string,
  modulesDir: string
): Promise<void> {
  const modulesPath = path.join(entrypointPath, 'node_modules');

  try {
    const prodPath = path.join(entrypointPath, modulesDir);
    if (fs.existsSync(prodPath)) {
      consola.log(`Using cached ${modulesDir}`);
    }
    try {
      if (fs.existsSync(modulesPath)) {
        await fs.unlink(modulesPath);
      }
      await fs.mkdirp(modulesDir);
    } catch {
      if (fs.existsSync(prodPath)) {
        fs.rmdirSync(modulesPath, { recursive: true });
      } else {
        fs.moveSync(modulesPath, prodPath);
      }
    }
    await fs.symlink(modulesDir, modulesPath);
  } catch (e) {
    consola.log(`Error linking/unlinking ${modulesDir}.`, e);
  }
}
