import path from 'path';
import fs from 'fs';
import {
  MutablePackageJson,
  startStep,
  validateEntrypoint,
  readJSON,
  prepareNodeModules,
  getQuasarConfig,
  exec,
  endStep,
  globAndPrefix,
} from './utils.js';
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
} from '@vercel/build-utils';

import type { Route } from '@vercel/routing-utils';
import packageJson from '../package.json' assert { type: 'json' };

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BuilderOutput {
  watch?: string[];
  output: Record<string, Lambda | File | FileFsRef>;
  routes: Route[];
}

export async function build(opts: BuildOptions): Promise<BuilderOutput> {
  const { files, entrypoint, workPath, config = {}, meta = {} } = opts;

  console.log(`use vercel-quasar@${packageJson.version}`);
  /** prepare build */
  startStep(`Prepare build`);
  validateEntrypoint(entrypoint);

  // Get quasar directory
  const entrypointDirname = path.dirname(entrypoint);
  // Get quasar path
  const entrypointPath = path.join(workPath, entrypointDirname);
  // Get folder where we'll store node_modules
  const modulesPath = path.join(entrypointPath, 'node_modules');

  // Create a real filesystem
  console.log('Downloading files...');
  await download(files, workPath, meta);

  // Change current working directory to entrypointPath
  process.chdir(entrypointPath);
  console.log('Working directory:', process.cwd());

  // Read package.json
  let pkg: MutablePackageJson;
  try {
    pkg = await readJSON('package.json');
  } catch (e) {
    throw new Error(`Can not read package.json from ${entrypointPath}`);
  }

  // Node version
  const nodeVersion = await getNodeVersion(entrypointPath, undefined, {}, meta);

  console.log('nodeVersion :', nodeVersion);

  const spawnOpts = getSpawnOptions(meta, nodeVersion);

  /** Not use pnpm at now.TODO:support pnpm */
  const pnpmLockName = 'pnpm-lock.yaml';
  let isPnpm = fs.existsSync(pnpmLockName);
  if (isPnpm) fs.unlinkSync(pnpmLockName);
  isPnpm = false;

  // Detect npm (prefer yarn)
  const isYarn = fs.existsSync('yarn.lock');

  const usingPacker = isYarn ? 'yarn' : 'npm';
  console.log('Using', usingPacker);

  // Write .npmrc
  if (process.env.NPM_RC) {
    console.log('Found NPM_RC in environment; creating .npmrc');
    await fs.promises.writeFile('.npmrc', process.env.NPM_RC);
  } else if (process.env.NPM_AUTH_TOKEN || process.env.NPM_TOKEN) {
    console.log(
      'Found NPM_AUTH_TOKEN or NPM_TOKEN in environment; creating .npmrc'
    );
    await fs.promises.writeFile(
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
  await fs.promises.mkdir(cachePath, {
    recursive: true,
  });

  const nodeModulesCachePath = path.join(cachePath, usingPacker);
  await fs.promises.mkdir(nodeModulesCachePath, {
    recursive: true,
  });

  function getInstallOptions(pnpm: boolean, production: boolean) {
    const noPnpmOptions = [
      '--non-interactive',
      `--modules-folder=${modulesPath}`,
      `--cache-folder=${nodeModulesCachePath}`,
    ];
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

  // TODO: Detect vercel analytics
  // if (process.env.VERCEL_ANALYTICS_ID) {
  // }

  // ----------------- Install devDependencies -----------------
  startStep('Install devDependencies');

  // Prepare node_modules
  await prepareNodeModules(entrypointPath, 'node_modules_dev');
  // Install all dependencies

  //'non-interactive', 'modules-folder', 'cache-folder'
  await runNpmInstall(
    entrypointPath,
    getInstallOptions(isPnpm, false),
    { ...spawnOpts, env: { ...spawnOpts.env, NODE_ENV: 'development' } },
    meta
  );

  // ----------------- Pre build -----------------

  // Read quasar.config.js
  const quasarConfig = await getQuasarConfig(entrypointPath);
  console.log('load quasar config', quasarConfig);

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
    console.log(
      'not find custom build command,will use default build command: quasar build -m ssr\n',
      'if you want to use custom it,add a build:ssr or build script to your package.json'
    );
    startStep(`build step`);
    await exec('quasar', ['build', '-m', 'ssr'], spawnOpts);
  }

  // ----------------- Install ssr dependencies -----------------
  startStep('Install dist dependencies');

  const distDir = quasarConfig.build.distDir;

  // Read package.json
  let pkgOfProd: MutablePackageJson;
  try {
    pkgOfProd = await readJSON(path.join(distDir, 'package.json'));
    console.log('pkgOfProd:', pkgOfProd);
  } catch (e) {
    throw new Error(`Can not read package.json from ${entrypointPath}`);
  }

  // Use node_modules_prod cache

  await runNpmInstall(distDir);
  endStep();

  // ----------------- Collect artifacts -----------------
  startStep('Collect artifacts');

  // Client dist files
  const clientDistDir = path.join(distDir, 'client');
  const clientDistFiles = await globAndPrefix('**', clientDistDir, publicPath);
  console.log('Collect client dist files');
  // Server dist files
  const serverDistDir = path.join(distDir, 'server');
  const serverDistFiles = await globAndPrefix('**', serverDistDir, 'server');
  console.log('Collect server dist files');

  // node_modules_prod
  const nodeModulesDir = path.join(distDir, 'node_modules');
  const nodeModules = await globAndPrefix('**', nodeModulesDir, 'node_modules');
  console.log('Collect node_modules');

  // Lambdas
  const lambdas: Record<string, Lambda> = {};

  const launcherPath = path.join(__dirname, 'launcher.js');

  const bridgePath = (await import('@vercel/node-bridge')).default;

  const launcherSrc = (await fs.promises.readFile(launcherPath, 'utf8'))
    .replace(
      /\/\* __ENABLE_INTERNAL_SERVER__ \*\/ *true/g,
      String(usesServerMiddleware)
    )
    .replace('__WILL_REPLACED_TO_REAL_PATH__', bridgePath);

  console.log('Collect launcher');

  const launcherFiles = {
    'vercel__launcher.js': new FileBlob({ data: launcherSrc }),
    ...serverDistFiles,
    ...nodeModules,
  };
  console.log('Collect server files');

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

  for (const pattern of serverFiles) {
    const files = await glob(pattern, distDir);
    Object.assign(launcherFiles, files);
  }
  console.log('Create lambda');

  lambdas[lambdaName] = new Lambda({
    handler: 'vercel__launcher.launcher',
    runtime: nodeVersion.runtime,
    files: launcherFiles,
    environment: {
      NODE_ENV: 'production',
      DEV: '',
      PROD: 'true',
    },
    //
    maxDuration: config.maxDuration as number | undefined,
    memory: config.memory as number | undefined,
  });
  console.log('Create lambda done');

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
