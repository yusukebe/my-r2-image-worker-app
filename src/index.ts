import { Hono } from 'hono'
import { sha256 } from 'hono/utils/crypto'
import { getExtension } from 'hono/utils/mime'
import { basicAuth } from 'hono/basic-auth'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.put('/upload', async (c, next) => {
  await basicAuth({ username: c.env.ID, password: c.env.PASSWORD })(c, next)
})

app.put('/upload', async (c) => {
  const data = await c.req.parseBody<{ image: File }>()
  const body = data.image
  const type = data.image.type
  const extension = getExtension(type) ?? 'png'

  const key = `${await sha256(await body.text())}.${extension}`
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: type } })

  return c.text(key)
})

app.get('/:key', async (c) => {
  const key = c.req.param('key')

  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()

  const contentType = object.httpMetadata?.contentType ?? ''
  return c.body(object.body, 200, {
    'Content-Type': contentType,
  })
})

export default app
