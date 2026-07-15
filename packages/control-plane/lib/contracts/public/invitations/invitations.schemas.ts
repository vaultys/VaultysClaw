import { z } from "zod";

// ── Path params
export const TokenParamSchema = z.object({ token: z.string() });
