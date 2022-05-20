# vercel-quasar
Vercel builder for Quasar with SSR enabled

Help you to deploy [Quasar](https://quasar.dev) application on [Vercel](https://vercel.com) in SSR mode

# usage
## 1. change the listen function in your `src-ssr/server.js` file
- remove all async and await. It is important,making sure the listen function will not return the content of the asynchronous
- return { handler: ssrHandler }
- example 
![server.js.example.ng](https://raw.githubusercontent.com/dongwa/vercel-quasar/dev/imgs/server.js.example.png)
``` js
/**
 * You need to make the server listen to the indicated port
 * and return the listening instance or whatever you need to
 * close the server with.
 *
 * The "listenResult" param for the "close()" definition below
 * is what you return here.
 *
 * For production, you can instead export your
 * handler for serverless use or whatever else fits your needs.
 */
export function listen({ app, port, isReady, ssrHandler }) {
  if (process.env.DEV) {
    await isReady();
    return app.listen(port, () => {
      if (process.env.PROD) {
        console.log('Server listening at port ' + port);
      }
    });
  } else {
    // in production
    // "ssrHandler" is a prebuilt handler which already
    // waits for all the middlewares to run before serving clients

    // whatever you return here is equivalent to module.exports.<key> = <value>
    return { handler: ssrHandler };
  }
}
```


## 2. Configure `vercel-quasar` as builder in `vercel.json`
### Add a `vercel.json` file to your project root path
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "vercel-quasar"
    }
  ]
}

```
## 3. Custom build command
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
    "build:ssr":"node build/index.js && quasar build -m ssr",
  },
  "dependencies": {

  },
  "devDependencies": {

  },
}
```