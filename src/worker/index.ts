import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { healthRoutes } from "./routes/health";
import { speciesRoutes } from "./routes/species";
import { eventRoutes } from "./routes/events";
import { spriteRoutes } from "./routes/sprites";
import { authRoutes } from "./routes/auth";
import { collectionRoutes } from "./routes/collection";
import { boxRoutes } from "./routes/boxes";
import { ribbonRoutes } from "./routes/ribbons";
import { importRoutes } from "./routes/import";
import { exportRoutes } from "./routes/export";
import { photoImportRoutes } from "./routes/photo-import";
import { saveImportRoutes } from "./routes/save-import";

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
app.route("/api/boxes", boxRoutes);
app.route("/api/ribbons", ribbonRoutes);
app.route("/api/import", importRoutes);
app.route("/api/import/photo", photoImportRoutes);
app.route("/api/import/save", saveImportRoutes);
app.route("/api/export", exportRoutes);
app.route("/sprites", spriteRoutes);

export default app;
