import { Hono } from 'hono'
import { sha256 } from 'hono/utils/crypto'
import { getExtension } from 'hono/utils/mime'
import { basicAuth } from 'hono/basic-auth'
import { cache } from 'hono/cache'
import * as z from 'zod'
import { zValidator } from '@hono/zod-validator'

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

app.get(
  '*',
  cache({
    cacheName: 'my-r2-image-worker-app'
  })
)

const schema = z.object({
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional()
})

app.get('/:key', zValidator('query', schema), async (c) => {
  const key = c.req.param('key')

  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()

  const { width, height } = c.req.valid('query')

  const result = await c.env.IMAGES.input(object.body)
    .transform({ width, height })
    //@ts-expect-error the contentType maybe valid format
    .output({ format: object.httpMetadata?.contentType ?? 'image/png' })

  return result.response()
})

export default app
