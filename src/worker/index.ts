import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { healthRoutes } from "./routes/health";
import { speciesRoutes } from "./routes/species";
import { eventRoutes } from "./routes/events";
import { spriteRoutes } from "./routes/sprites";
import { authRoutes } from "./routes/auth";
import { collectionRoutes } from "./routes/collection";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  return c.json({ error: "internal_error" }, 500);
});

app.route("/api", healthRoutes);
app.route("/api", speciesRoutes);
app.route("/api", eventRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/collection", collectionRoutes);
app.route("/sprites", spriteRoutes);

export default app;
