import { OrgSkillDAO } from "@/db";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(userContract.skills, {
  // ── GET /api/skills/library — the org catalog, mapped to LibrarySkill DTOs ─
  library: async ({ request }) => {

    const skills = await OrgSkillDAO.findAll();
    const payload = skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      source: "built-in",
      skillId: s.name,
      installs: 0,
      githubStars: 0,
      repoUrl: "",
      standalone: false,
      icon: s.icon ?? null,
      version: s.version,
      content: s.content ?? null,
      contentType: {
        hasInstructions: Boolean(s.content),
        hasScripts: false,
        hasReferences: false,
        hasAssets: false,
      },
    }));

    return { status: 200, body: payload };
  },
});

export const GET = handlers.GET!;
