import { z } from "zod";
import {
  BastionAssociateBodySchema,
  BastionConnectQuerySchema,
  ConnectQuerySchema,
} from "./user-auth.schemas";

export type ConnectQuery = z.infer<typeof ConnectQuerySchema>;
export type BastionConnectQuery = z.infer<typeof BastionConnectQuerySchema>;
export type BastionAssociateBody = z.infer<typeof BastionAssociateBodySchema>;
