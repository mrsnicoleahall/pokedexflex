import { Hono, type Context } from "hono";

type SpriteEnv = { Bindings: Env };

export const spriteRoutes = new Hono<SpriteEnv>();

const PNG_HEADERS = {
  "content-type": "image/png",
  "cache-control": "public, max-age=31536000, immutable",
};

// Sprite keys are locked to this charset to prevent path traversal. A key is
// either a numeric national id ("25") or a form filename slug ("669-blue",
// "666-icy-snow", "10091"). HOME 3D renders exist for cosmetic forms under
// these slugs too, not only for numeric ids.
const SPRITE_KEY = /^[a-z0-9-]{1,64}$/;
const NUMERIC_KEY = /^[0-9]+$/;

const homeUpstreamUrl = (key: string, shiny: boolean) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${
    shiny ? "shiny/" : ""
  }${key}.png`;

const homeR2Key = (key: string, shiny: boolean) => `home/${shiny ? "shiny/" : ""}${key}.png`;

const formUpstreamUrl = (slug: string) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${slug}.png`;

const formR2Key = (slug: string) => `form/${slug}.png`;

// Serve a HOME sprite by key. Shiny is numeric-only (the main dex); the
// non-shiny route also accepts form slugs so the Forms gallery gets the 3D
// HOME render for cosmetic variants instead of the pixel 2D fallback.
const serveHome = async (c: Context<SpriteEnv>, rawKey: string, shiny: boolean) => {
  const valid = shiny ? NUMERIC_KEY.test(rawKey) : SPRITE_KEY.test(rawKey);
  if (!valid) return c.json({ error: "bad_id" }, 400);

  const key = homeR2Key(rawKey, shiny);
  const cached = await c.env.SPRITES.get(key);
  if (cached) {
    return new Response(cached.body, { headers: PNG_HEADERS });
  }

  const upstream = await fetch(homeUpstreamUrl(rawKey, shiny));
  if (upstream.status !== 200) {
    return c.json({ error: "not_found" }, 404);
  }

  const bytes = await upstream.arrayBuffer();
  await c.env.SPRITES.put(key, bytes);
  return new Response(bytes, { headers: PNG_HEADERS });
};

const serveFormSprite = async (c: Context<SpriteEnv>, slug: string) => {
  if (!SPRITE_KEY.test(slug)) return c.json({ error: "bad_slug" }, 400);

  const key = formR2Key(slug);
  const cached = await c.env.SPRITES.get(key);
  if (cached) {
    return new Response(cached.body, { headers: PNG_HEADERS });
  }

  const upstream = await fetch(formUpstreamUrl(slug));
  if (upstream.status !== 200) {
    return c.json({ error: "not_found" }, 404);
  }

  const bytes = await upstream.arrayBuffer();
  await c.env.SPRITES.put(key, bytes);
  return new Response(bytes, { headers: PNG_HEADERS });
};

spriteRoutes.get("/home/shiny/:id", (c) => serveHome(c, c.req.param("id"), true));
spriteRoutes.get("/home/:id", (c) => serveHome(c, c.req.param("id"), false));
spriteRoutes.get("/form/:slug", (c) => serveFormSprite(c, c.req.param("slug")));
