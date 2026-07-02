import { z } from "zod";
import { ListUserAgentsQuerySchema } from "./agents.schemas";

export type ListUserAgentsQuery = z.infer<typeof ListUserAgentsQuerySchema>;
