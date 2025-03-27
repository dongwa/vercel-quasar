# vercel-quasar

Vercel builder for Quasar with SSR enabled

Help you to deploy [Quasar](https://quasar.dev) application on [Vercel](https://vercel.com) in SSR mode

# usage

## 1. change the listen function in your `src-ssr/server.js|ts` file

- return { handler: ssrHandler }

```js
export const listen = defineSsrListen(({ app, devHttpsApp, port }) => {
  const server = devHttpsApp || app;
  if (process.env.DEV) {
    return server.listen(port, () => {
      if (process.env.PROD) {
        console.log('Server listening at port ' + port);
      }
    });
  } else {
    return {
      handler: server,
    };
  }
});
```

## 2. Configure `vercel-quasar` as builder in `vercel.json`

### Add a `vercel.json` file to your project root path

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "vercel-quasar@2.0.0-beta.3"
    }
  ]
}
```

## 3. Custom build command （Optional!）

### The default build command is `npx quasar build -m ssr`,if you want to use custom it,add a `build:ssr` or `build` script to your package.json

> Note that the priority of `build:ssr` is higher than that of `build`. If `build:ssr` exists, command `build` will not be executed in deploy.

- example

###

```json
{
  "name": "quasar-example",
  "version": "1.0.0",
  "productName": "quasar-example",
  "scripts": {
    "dev": "quasar dev",
    "dev:ssr": "quasar dev -m ssr",
    "build:ssr": "quasar build -m ssr"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

# demo

Here is a demo repo
https://github.com/dongwa/quasar-ssr-vercel-demo
