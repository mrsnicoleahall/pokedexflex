import { Hono, type Context } from "hono";

type SpriteEnv = { Bindings: Env };

export const spriteRoutes = new Hono<SpriteEnv>();

const PNG_HEADERS = {
  "content-type": "image/png",
  "cache-control": "public, max-age=31536000, immutable",
};

const upstreamUrl = (id: number, shiny: boolean) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${
    shiny ? "shiny/" : ""
  }${id}.png`;

const r2Key = (id: number, shiny: boolean) => `home/${shiny ? "shiny/" : ""}${id}.png`;

const parseId = (raw: string): number | null => {
  if (!/^[0-9]+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
};

const serveSprite = async (c: Context<SpriteEnv>, rawId: string, shiny: boolean) => {
  const id = parseId(rawId);
  if (id === null) return c.json({ error: "bad_id" }, 400);

  const key = r2Key(id, shiny);
  const cached = await c.env.SPRITES.get(key);
  if (cached) {
    return new Response(cached.body, { headers: PNG_HEADERS });
  }

  const upstream = await fetch(upstreamUrl(id, shiny));
  if (upstream.status !== 200) {
    return c.json({ error: "not_found" }, 404);
  }

  const bytes = await upstream.arrayBuffer();
  await c.env.SPRITES.put(key, bytes);
  return new Response(bytes, { headers: PNG_HEADERS });
};

spriteRoutes.get("/home/shiny/:id", (c) => serveSprite(c, c.req.param("id"), true));
spriteRoutes.get("/home/:id", (c) => serveSprite(c, c.req.param("id"), false));
