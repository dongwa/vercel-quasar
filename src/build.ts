import path, { dirname, relative, resolve, sep } from 'path';
import fs, { lstatSync, readFileSync, readlinkSync, statSync } from 'fs-extra';
import consola from 'consola';
import { nodeFileTrace } from '@vercel/nft';
import nftResolveDependency from '@vercel/nft/out/resolve-dependency';
import { isErrnoException } from '@vercel/error-utils';
import {
  MutablePackageJson,
  startStep,
  validateEntrypoint,
  readJSON,
  getQuasarConfig,
  exec,
  endStep,
  globAndPrefix,
} from './utils';
import {
  BuildOptions,
  download,
  File,
  FileFsRef,
  getNodeVersion,
  getSpawnOptions,
  Lambda,
  runNpmInstall,
  glob,
  FileBlob,
  runPackageJsonScript,
  Config,
  Files,
  isSymbolicLink,
  NodejsLambda,
} from '@vercel/build-utils';

import type { Route } from '@vercel/routing-utils';

interface BuilderOutput {
  watch?: string[];
  output: Record<string, Lambda | File | FileFsRef>;
  routes: Route[];
}

async function getPreparedFiles(
  quasarSSREntry: string,
  baseDir: string,
  config: Config
) {
  const preparedFiles: Files = {};
  const inputFiles = new Set<string>([quasarSSREntry]);

  const sourceCache = new Map<string, string | Buffer | null>();
  const fsCache = new Map<string, File>();

  if (config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;

    for (const pattern of includeFiles) {
      const files = await glob(pattern, baseDir);
      await Promise.all(
        Object.values(files).map(async (entry) => {
          const { fsPath } = entry;
          const relPath = relative(baseDir, fsPath);
          preparedFiles[relPath] = entry;
        })
      );
    }
  }

  const { fileList, warnings } = await nodeFileTrace([...inputFiles], {
    base: baseDir,
    processCwd: baseDir,
    mixedModules: true,
    resolve(id, parent, job, cjsResolve) {
      const normalizedWasmImports = id.replace(/\.wasm\?module$/i, '.wasm');
      return nftResolveDependency(
        normalizedWasmImports,
        parent,
        job,
        cjsResolve
      );
    },
    ignore: config.excludeFiles,
    async readFile(fsPath) {
      const relPath = relative(baseDir, fsPath);

      // If this file has already been read then return from the cache
      const cached = sourceCache.get(relPath);
      if (typeof cached !== 'undefined') return cached;

      try {
        let entry: File | undefined;
        let source: string | Buffer = readFileSync(fsPath);

        const { mode } = lstatSync(fsPath);
        if (isSymbolicLink(mode)) {
          entry = new FileFsRef({ fsPath, mode });
        }

        if (!entry) {
          entry = new FileBlob({ data: source, mode });
        }
        fsCache.set(relPath, entry);
        sourceCache.set(relPath, source);
        return source;
      } catch (error: unknown) {
        if (
          isErrnoException(error) &&
          (error.code === 'ENOENT' || error.code === 'EISDIR')
        ) {
          // `null` represents a not found
          sourceCache.set(relPath, null);
          return null;
        }
        throw error;
      }
    },
  });

  for (const warning of warnings) {
    console.log(`Warning from trace: ${warning.message}`);
  }
  for (const path of fileList) {
    let entry = fsCache.get(path);
    if (!entry) {
      const fsPath = resolve(baseDir, path);
      const { mode } = lstatSync(fsPath);
      if (isSymbolicLink(mode)) {
        entry = new FileFsRef({ fsPath, mode });
      } else {
        const source = readFileSync(fsPath);
        entry = new FileBlob({ data: source, mode });
      }
    }
    if (isSymbolicLink(entry.mode) && entry.type === 'FileFsRef') {
      // ensure the symlink target is added to the file list
      const symlinkTarget = relative(
        baseDir,
        resolve(dirname(entry.fsPath), readlinkSync(entry.fsPath))
      );
      if (
        !symlinkTarget.startsWith('..' + sep) &&
        !fileList.has(symlinkTarget)
      ) {
        const stats = statSync(resolve(baseDir, symlinkTarget));
        if (stats.isFile()) {
          fileList.add(symlinkTarget);
        }
      }
    }

    preparedFiles[path] = entry;
  }

  return {
    preparedFiles,
  };
}

export async function build(opts: BuildOptions): Promise<BuilderOutput> {
  const { files, entrypoint, workPath, config = {}, meta = {} } = opts;

  consola.log(`use vercel-quasar@${require('../package.json').version}`);
  /** prepare build */
  startStep(`Prepare build`);
  validateEntrypoint(entrypoint);

  // Get quasar directory
  const entrypointDirname = path.dirname(entrypoint);
  // Get quasar path
  const entrypointPath = path.join(workPath, entrypointDirname);

  // Create a real filesystem
  consola.log('Downloading files...');
  await download(files, workPath, meta);

  // Change current working directory to entrypointPath
  process.chdir(entrypointPath);
  consola.log('Working directory:', process.cwd());

  // Read package.json
  let pkg: MutablePackageJson;
  try {
    pkg = await readJSON('package.json');
  } catch (e) {
    throw new Error(`Can not read package.json from ${entrypointPath}`);
  }

  // Node version
  const nodeVersion = await getNodeVersion(entrypointPath, undefined, {}, meta);

  consola.log('nodeVersion :', nodeVersion);

  const spawnOpts = getSpawnOptions(meta, nodeVersion);

  const pnpmLockName = 'pnpm-lock.yaml';
  let isPnpm = fs.existsSync(pnpmLockName);

  const isYarn = !fs.existsSync('package-lock.json');

  const usingPacker = isPnpm ? 'pnpm' : isYarn ? 'yarn' : 'npm';
  consola.log('Using', usingPacker);

  // Write .npmrc
  if (process.env.NPM_RC) {
    consola.log('Found NPM_RC in environment; creating .npmrc');
    await fs.writeFile('.npmrc', process.env.NPM_RC);
  } else if (process.env.NPM_AUTH_TOKEN || process.env.NPM_TOKEN) {
    consola.log(
      'Found NPM_AUTH_TOKEN or NPM_TOKEN in environment; creating .npmrc'
    );
    await fs.writeFile(
      '.npmrc',
      `//registry.npmjs.org/:_authToken=${
        process.env.NPM_AUTH_TOKEN || process.env.NPM_TOKEN
      }`
    );
  }

  // // Write .yarnclean
  // if (isYarn && !fs.existsSync('../.yarnclean')) {
  //   await fs.copyFile(path.join(entrypointPath, '../.yarnclean'), '.yarnclean');
  // }

  // Cache dir
  const cachePath = path.resolve(entrypointPath, '.vercel_cache');
  await fs.mkdirp(cachePath);

  const nodeModulesCachePath = path.join(cachePath, usingPacker);
  await fs.mkdirp(nodeModulesCachePath);

  function getInstallOptions(pnpm: boolean, production: boolean) {
    const noPnpmOptions = ['--non-interactive'];
    const options = [
      '--prefer-offline',
      '--frozen-lockfile',
      `--production=${production}`,
    ];
    const pnpmOtions = ['--no-frozen-lockfile'];
    if (!pnpm) return [...options, ...noPnpmOptions];
    else if (production) return [...options, ...pnpmOtions];
    return options;
  }

  // ----------------- Install Dependencies -----------------
  startStep('Install Dependencies');

  // // Prepare node_modules
  // await prepareNodeModules(entrypointPath, 'node_modules_dev');
  // Install all dependencies

  //'non-interactive', 'modules-folder', 'cache-folder'
  await runNpmInstall(
    entrypointPath,
    getInstallOptions(isPnpm, false),
    { ...spawnOpts, env: { ...spawnOpts.env, NODE_ENV: 'development' } },
    meta
  );

  // ----------------- Pre build -----------------
  const quasarConfig = getQuasarConfig(entrypointPath);
  consola.log('load quasar config', quasarConfig);

  let publicPath = (quasarConfig.build.publicPath || '/_quasar/').replace(
    /^\//,
    ''
  );

  const lambdaName = 'index';
  const usesServerMiddleware =
    config.internalServer !== undefined
      ? config.internalServer
      : !!quasarConfig.ssr.middlewares;
  let hasCustomBuildCmd = false;
  const buildSteps = ['build:ssr', 'build'];
  for (const step of buildSteps) {
    if (pkg.scripts && Object.keys(pkg.scripts).includes(step)) {
      hasCustomBuildCmd = true;
      startStep(`build (${step})`);
      await runPackageJsonScript(entrypointPath, step, spawnOpts);
      break;
    }
  }

  if (!hasCustomBuildCmd) {
    consola.log(
      'not find custom build command,will use default build command: quasar build -m ssr\n',
      'if you want to use custom it,add a build:ssr or build script to your package.json'
    );
    startStep(`build step`);
    await exec('quasar', ['build', '-m', 'ssr'], spawnOpts);
  }

  // ----------------- Install ssr dependencies -----------------
  startStep('Install dist dependencies');

  const distDir = path.join(entrypointPath, quasarConfig.build.distDir);

  // ----------------- Collect artifacts -----------------
  startStep('Collect artifacts');

  const ssrIndex = path.resolve(distDir, 'index.js');
  const { preparedFiles } = await getPreparedFiles(ssrIndex, workPath, config);

  // Client dist files
  const clientDistDir = path.join(distDir, 'client');
  const clientDistFiles = await globAndPrefix('**', clientDistDir, publicPath);

  // Server dist files

  // node_modules_prod

  // Lambdas
  const lambdas: Record<string, Lambda> = {};

  const launcherPath = path.join(__dirname, 'launcher.js');
  const launcherSrc = (await fs.readFile(launcherPath, 'utf8')).replace(
    /\/\* __ENABLE_INTERNAL_SERVER__ \*\/ *true/g,
    String(usesServerMiddleware)
  );

  const launcherFiles = {
    'vercel__launcher.js': new FileBlob({ data: launcherSrc }),
    'vercel__bridge.js': new FileFsRef({
      fsPath: require('@vercel/node-bridge'),
    }),
    ...preparedFiles,
  };

  // Extra files to be included in lambda
  const serverFiles = [
    ...(Array.isArray(config.includeFiles)
      ? config.includeFiles
      : config.includeFiles
      ? [config.includeFiles]
      : []),
    ...(Array.isArray(config.serverFiles) ? config.serverFiles : []),
    'package.json',
    'index.js',
    'quasar.manifest.json',
    'render-template.js',
  ];

  // for (const pattern of serverFiles) {
  //   const files = await glob(pattern, distDir);
  //   Object.assign(launcherFiles, files);
  // }
  // "nodejs" runtime is the default
  const shouldAddHelpers = !(
    config.helpers === false || process.env.NODEJS_HELPERS === '0'
  );

  // lambdaName will be titled index, unless specified in quasar.config.js
  lambdas[lambdaName] = new NodejsLambda({
    files: launcherFiles,
    handler: 'vercel__launcher.launcher',
    runtime: nodeVersion.runtime,
    // environment: {
    //   NODE_ENV: 'production',
    //   DEV: '',
    //   PROD: 'true',
    // },
    maxDuration: config.maxDuration as number | undefined,
    memory: config.memory as number | undefined,
    shouldAddHelpers,
    shouldAddSourcemapSupport: false,
  });

  endStep();

  return {
    output: {
      ...lambdas,
      ...clientDistFiles,
    },
    routes: [
      {
        src: `/${publicPath}.+`,
        headers: { 'Cache-Control': 'max-age=31557600' },
      },
      {
        src: '/manifest.json',
        headers: {
          'Cache-Control': 'max-age=31557600',
        },
      },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ],
  };
}
