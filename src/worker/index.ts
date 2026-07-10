import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { speciesRoutes } from "./routes/species";
import { eventRoutes } from "./routes/events";
import { spriteRoutes } from "./routes/sprites";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", healthRoutes);
app.route("/api", speciesRoutes);
app.route("/api", eventRoutes);
app.route("/sprites", spriteRoutes);

export default app;
