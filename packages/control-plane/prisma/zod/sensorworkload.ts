import * as z from "zod"
import { CompleteSensorDevice, RelatedSensorDeviceModel } from "./index"

// Helper schema for JSON fields
type Literal = boolean | number | string
type Json = Literal | { [key: string]: Json } | Json[]
const literalSchema = z.union([z.string(), z.number(), z.boolean()])
const jsonSchema: z.ZodSchema<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]))

export const SensorWorkloadModel = z.object({
  id: z.string(),
  deviceDid: z.string(),
  fingerprint: z.string(),
  processName: z.string().nullish(),
  executable: z.string().nullish(),
  command: z.string().nullish(),
  osUser: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  aiConfidence: z.number(),
  agentConfidence: z.number(),
  reasons: jsonSchema,
  isMcp: z.boolean(),
  mcpServers: jsonSchema,
  isLocalRuntime: z.boolean(),
  lastEventType: z.string().nullish(),
  firstSeen: z.date(),
  lastSeen: z.date(),
})

export interface CompleteSensorWorkload extends z.infer<typeof SensorWorkloadModel> {
  device: CompleteSensorDevice
}

/**
 * RelatedSensorWorkloadModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedSensorWorkloadModel: z.ZodSchema<CompleteSensorWorkload> = z.lazy(() => SensorWorkloadModel.extend({
  device: RelatedSensorDeviceModel,
}))
