import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { speciesRoutes } from "./routes/species";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", healthRoutes);
app.route("/api", speciesRoutes);

export default app;
