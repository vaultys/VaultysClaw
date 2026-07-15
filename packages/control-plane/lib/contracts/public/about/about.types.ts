import { z } from "zod";
import { AboutQuerySchema, AboutResponseSchema } from "./about.schemas";

export type AboutQuery = z.infer<typeof AboutQuerySchema>;
export type AboutResponse = z.infer<typeof AboutResponseSchema>;
