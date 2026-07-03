import { z } from "zod";
import { LibrarySkillSchema } from "./skills.schemas";

export type LibrarySkill = z.infer<typeof LibrarySkillSchema>;
