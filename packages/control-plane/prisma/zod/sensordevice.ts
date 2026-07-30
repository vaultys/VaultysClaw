import * as z from "zod"
import { CompleteUser, RelatedUserModel, CompleteWorkspace, RelatedWorkspaceModel, CompleteSensorWorkload, RelatedSensorWorkloadModel } from "./index"

export const SensorDeviceModel = z.object({
  did: z.string(),
  name: z.string().nullish(),
  hostname: z.string().nullish(),
  os: z.string().nullish(),
  assignedUserId: z.string().nullish(),
  workspaceId: z.string().nullish(),
  firstSeen: z.date(),
  lastSeen: z.date(),
})

export interface CompleteSensorDevice extends z.infer<typeof SensorDeviceModel> {
  assignedUser?: CompleteUser | null
  workspace?: CompleteWorkspace | null
  workloads: CompleteSensorWorkload[]
}

/**
 * RelatedSensorDeviceModel contains all relations on your model in addition to the scalars
 *
 * NOTE: Lazy required in case of potential circular dependencies within schema
 */
export const RelatedSensorDeviceModel: z.ZodSchema<CompleteSensorDevice> = z.lazy(() => SensorDeviceModel.extend({
  assignedUser: RelatedUserModel.nullish(),
  workspace: RelatedWorkspaceModel.nullish(),
  workloads: RelatedSensorWorkloadModel.array(),
}))
