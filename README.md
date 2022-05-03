# vercel-quasar
Vercel builder for Quasar with SSR enabled
# useage
`pnpm i` 

`pnpm lint`

`pnpm fix`

`pnpm test`

`pnpm build`
##### 1. Configure `vercel-quasar` as builder in `vercel.json`

```json
{
  "version": 2,
  "builds": [
    { "src": "package.json", "use": "vercel-quasar" },
    {"src":"dist/quasar.dev/index.js","use":"@vercel/node"}
    ]
}
```