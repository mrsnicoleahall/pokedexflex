import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", healthRoutes);

export default app;
