import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import postsRouter from "./posts.js";
import configRouter from "./config.js";
import statsRouter from "./stats.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(configRouter);
router.use(statsRouter);

export default router;
