import { OrgSkillDAO, RealmDAO, SettingsDAO } from "../db";
import { VaultysId } from "@vaultys/id";

async function seedDefaults() {
  const realmCount = await (await import("../db/client")).prisma.realm.count();
  if (realmCount === 0) {
    const id = crypto.randomUUID();
    await (await import("../db/client")).prisma.realm.create({
      data: {
        id,
        name: "Default",
        slug: "default",
        description: "The default realm",
        color: "#6366f1",
        isDefault: true,
      },
    });
  }

  const builtInSkills = [
    {
      name: "social-media",
      description:
        "Post content to X (Twitter) via Playwright browser automation. Requires a one-time browser login; subsequent runs are headless.",
      version: "1.0.0",
      icon: "📣",
      content:
        "## Social Media\n\nYou have access to X (Twitter) social-media tools.\n\n- Use `check_x_session` to verify setup.\n- Use `setup_x_session` for first-time authentication (opens a browser).\n- Use `post_to_x` to publish a tweet (max 280 chars, **requires approval**).\n\nTweets must be ≤280 characters. Keep them engaging and on-brand.",
    },
    {
      name: "web-scraper",
      description:
        "Scrape web pages and extract their text content. Useful for research, monitoring, and content ingestion tasks.",
      version: "1.0.0",
      icon: "🌐",
      content:
        "## Web Scraper\n\nYou can scrape public web pages using the `scrape_page` tool.\n\n- Provide a valid URL.\n- Returns the page title and cleaned text content.\n- Respects robots.txt by default.",
    },
    {
      name: "json-api",
      description:
        "Make authenticated or anonymous JSON API calls to external HTTP endpoints. Supports GET, POST, PUT, PATCH, DELETE.",
      version: "1.0.0",
      icon: "🔌",
      content:
        "## JSON API\n\nYou can call external HTTP APIs using the `api_call_json` tool.\n\n- Specify the URL, method, optional headers, and body.\n- The response is returned as a parsed JSON object.\n- Use for reading data from REST APIs or triggering webhooks.",
    },
    {
      name: "calculator",
      description:
        "Evaluate arithmetic and algebraic expressions. Useful for quick calculations inside agent workflows.",
      version: "1.0.0",
      icon: "🧮",
      content:
        "## Calculator\n\nYou can evaluate math expressions using the `calculate` tool.\n\n- Supports standard arithmetic, parentheses, powers, and common functions (sqrt, abs, etc.).\n- Returns the numeric result.",
    },
  ];

  for (const skill of builtInSkills) {
    await OrgSkillDAO.upsertBuiltIn(skill);
  }
}

async function initServerIdentity() {
  const existing = await SettingsDAO.get("serverSecret");
  if (!existing) {
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    const secret = vid.getSecret("base64");
    await SettingsDAO.set("serverSecret", secret);
  }
}

seedDefaults()
  .then(() => initServerIdentity())
  .then(() => {
    console.log("[seed] Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed] Error", err);
    process.exit(1);
  });
