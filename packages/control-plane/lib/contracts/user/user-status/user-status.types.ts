import { z } from "zod";
import { UserStatusResponseSchema } from "./user-status.schemas";

export type UserStatusResponse = z.infer<typeof UserStatusResponseSchema>;
