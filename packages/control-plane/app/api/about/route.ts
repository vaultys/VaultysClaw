import fs from "fs";
import path from "path";
import { APIException } from "@/lib/api/utils/api-utils";
import { aboutContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getAuthContext } from "@/lib/auth-utils";

const DOCS: Record<string, string[]> = {
  readme: ["README.md", "../../README.md", "../../../README.md"],
  zerotrust: [
    "ZERO_TRUST_COMPLIANCE.md",
    "../../ZERO_TRUST_COMPLIANCE.md",
    "../../../ZERO_TRUST_COMPLIANCE.md",
  ],
};

function resolveDoc(candidates: string[]): string | null {
  for (const rel of candidates) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      return fs.readFileSync(abs, "utf-8");
    }
  }
  return null;
}

const handlers = createNextRoute(aboutContract, {
  get: async ({ query, request }) => {
    await getAuthContext(request);

    const doc = query.doc ?? "readme";
    const candidates = DOCS[doc];
    if (!candidates) {
      throw new APIException("NOT_FOUND", `Document '${doc}' not found`);
    }

    const content = resolveDoc(candidates);
    if (content === null) {
      throw new APIException("NOT_FOUND", `Document '${doc}' not found`);
    }

    return { status: 200, body: { content } };
  },
});

export const GET = handlers.GET!;
