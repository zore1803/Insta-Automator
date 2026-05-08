import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import postsRouter from "./posts.js";
import configRouter from "./config.js";
import statsRouter from "./stats.js";
import analyticsRouter from "./analytics.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.use(postsRouter);
router.use(configRouter);
router.use(statsRouter);
router.use(analyticsRouter);

export default router;
