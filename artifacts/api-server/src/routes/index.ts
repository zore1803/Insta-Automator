import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import postsRouter from "./posts";
import configRouter from "./config";
import statsRouter from "./stats";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.use(postsRouter);
router.use(configRouter);
router.use(statsRouter);

export default router;
