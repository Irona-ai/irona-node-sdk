import { modelSelect } from "@/controllers/modelSelect.controller";
import { validateRequest } from "@/middlewares/requestValidator";
import { modelSelectSchema } from "@/validators/modelSelect.validator";
import { Router } from "express";

const router = Router();

router.post(
  "/select-model",
  validateRequest({ body: modelSelectSchema }),
  modelSelect
);

export default router;
