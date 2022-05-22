import path from 'path';
import fs from 'fs-extra';
import consola from 'consola';
import {
  MutablePackageJson,
  startStep,
  validateEntrypoint,
  readJSON,
  prepareNodeModules,
  getQuasarConfig,
  exec,
  endStep,
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
  createLambda,
} from '@vercel/build-utils';

import type { Route } from '@vercel/routing-utils';

interface BuilderOutput {
  watch?: string[];
  output: Record<string, Lambda | File | FileFsRef>;
  routes: Route[];
}

export async function build(opts: BuildOptions): Promise<BuilderOutput> {
  const { files, entrypoint, workPath, config = {}, meta = {} } = opts;
  /** prepare build */
  startStep('Prepare build');
  validateEntrypoint(entrypoint);

  // Get quasar directory
  const entrypointDirname = path.dirname(entrypoint);
  // Get quasar path
  const entrypointPath = path.join(workPath, entrypointDirname);
  // Get folder where we'll store node_modules
  const modulesPath = path.join(entrypointPath, 'node_modules');

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
  const spawnOpts = getSpawnOptions(meta, nodeVersion);

  // Detect npm (prefer yarn)
  const isYarn = !fs.existsSync('package-lock.json');
  consola.log('Using', isYarn ? 'yarn' : 'npm');

  // Cache dir
  const cachePath = path.resolve(entrypointPath, '.quasar_cache');
  await fs.mkdirp(cachePath);

  const yarnCachePath = path.join(cachePath, 'yarn');
  await fs.mkdirp(yarnCachePath);

  // TODO: Detect vercel analytics
  // if (process.env.VERCEL_ANALYTICS_ID) {
  // }

  // ----------------- Install devDependencies -----------------
  startStep('Install devDependencies');

  // Prepare node_modules
  await prepareNodeModules(entrypointPath, 'node_modules_dev');
  // Install all dependencies
  await runNpmInstall(
    entrypointPath,
    [
      '--prefer-offline',
      '--frozen-lockfile',
      '--non-interactive',
      '--production=false',
      `--modules-folder=${modulesPath}`,
      `--cache-folder=${yarnCachePath}`,
    ],
    { ...spawnOpts, env: { ...spawnOpts.env, NODE_ENV: 'development' } },
    meta
  );

  // ----------------- Pre build -----------------

  // Read quasar.config.js
  const quasarConfigName = 'quasar.config.js';
  const quasarConfigFile = getQuasarConfig(entrypointPath);
  consola.log('load quasar config', quasarConfigFile);

  // Read options from quasar.config.js otherwise set sensible defaults
  // const staticDir =
  //   quasarConfigFile.dir && quasarConfigFile.dir.static
  //     ? quasarConfigFile.dir.static
  //     : 'static';
  let publicPath = (quasarConfigFile.build.publicPath || '/_quasar/').replace(
    /^\//,
    ''
  );
  // if (hasProtocol(publicPath)) {
  //   publicPath = '_quasar/';
  // }
  // const buildDir = quasarConfigFile.build.distDir
  //   ? path.relative(entrypointPath, quasarConfigFile.build.distDir)
  //   : 'dist/ssr';
  // const srcDir = '.';
  const lambdaName = 'index';
  const usesServerMiddleware =
    config.internalServer !== undefined
      ? config.internalServer
      : !!quasarConfigFile.ssr.middlewares;
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

  const distDir = path.join(entrypointPath, quasarConfigFile.build.distDir);
  // Get folder where we'll store node_modules
  const distModulesPath = path.join(distDir, 'node_modules');
  // Cache dir
  const distCachePath = path.resolve(entrypointPath, '.quasar_dist_cache');
  await fs.mkdirp(distCachePath);

  const distYarnCachePath = path.join(distCachePath, 'yarn');
  await fs.mkdirp(distYarnCachePath);

  // Use node_modules_prod cache
  await prepareNodeModules(distDir, 'node_modules_prod');

  await runNpmInstall(
    distDir,
    [
      '--prefer-offline',
      '--pure-lockfile',
      '--non-interactive',
      '--production=true',
      `--modules-folder=${distModulesPath}`,
      `--cache-folder=${distYarnCachePath}`,
    ],
    {
      ...spawnOpts,
      env: {
        ...spawnOpts.env,
        NPM_ONLY_PRODUCTION: 'true',
      },
    },
    meta
  );

  // ----------------- Collect artifacts -----------------
  startStep('Collect artifacts');

  // Static files
  // const staticFiles = await glob(
  //   '**',
  //   path.join(entrypointPath, srcDir, staticDir)
  // );

  // Client dist files
  const clientDistDir = path.join(distDir, 'client');
  // const clientDistFiles = await globAndPrefix('**', clientDistDir, publicPath);
  const clientDistFiles = await glob('**', clientDistDir);

  // Server dist files
  const serverDistDir = path.join(distDir, 'server');
  const serverDistFiles = await glob('**', serverDistDir);

  const distFils = await glob('**', distDir);

  // const serverDistFiles = await globAndPrefix(
  //   '**',
  //   serverDistDir,
  //   path.join(distDir, 'server')
  // );

  // Generated static files
  // const generatedDir = path.join(entrypointPath, 'dist');
  // const generatedPagesFiles = config.generateStaticRoutes
  //   ? await globAndPrefix('**/*.*', generatedDir, './')
  //   : {};

  // node_modules_prod
  const nodeModulesDir = path.join(distDir, 'node_modules');
  const nodeModules = await glob('**', nodeModulesDir);

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
    [quasarConfigName]: new FileFsRef({
      fsPath: path.resolve(entrypointPath, quasarConfigName),
    }),
    ...distFils,
    ...nodeModules,
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
  ];

  for (const pattern of serverFiles) {
    const files = await glob(pattern, entrypointPath);
    Object.assign(launcherFiles, files);
  }

  // lambdaName will be titled index, unless specified in quasar.config.js
  lambdas[lambdaName] = await createLambda({
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

  // await download(launcherFiles, rootDir)

  endStep();

  return {
    output: {
      ...lambdas,
      ...distFils,
    },
    routes: [
      {
        src: `/${publicPath}.+`,
        headers: { 'Cache-Control': 'max-age=31557600' },
      },
      {
        src: '/index.js',
        headers: { 'cache-control': 'public,max-age=0,must-revalidate' },
        continue: true,
      },
      {
        src: '/server/server-entry.js',
        headers: { 'cache-control': 'public,max-age=0,must-revalidate' },
        continue: true,
      },
      // ...Object.keys(staticFiles).map((file) => ({
      //   src: `/${file}`,
      //   headers: { 'Cache-Control': 'max-age=31557600' },
      // })),
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/' },
    ],
  };
}
