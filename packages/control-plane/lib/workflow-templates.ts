/**
 * Predefined workflow templates for common use cases
 */

import type { WorkflowDefinition } from "./db";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "analysis" | "writing" | "research" | "automation" | "social-media";
  definition: WorkflowDefinition;
  icon?: string;
  /** Suggested cron expression to auto-populate the schedule panel */
  suggestedCron?: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ── Social-media automation ──────────────────────────────────────────────
  {
    id: "template-daily-social-post",
    name: "Daily Social Media Post",
    description:
      "Generates a short, engaging post using an AI agent then publishes it to X (Twitter) via browser automation. " +
      "Schedule it to run every morning for fully automated daily publishing.",
    category: "social-media",
    icon: "📣",
    suggestedCron: "0 9 * * *", // 9 AM every day
    definition: {
      nodes: [
        {
          // Step 1 — generate the tweet copy with an LLM agent
          id: "generate",
          type: "agent",
          data: {
            agentId: undefined, // auto-resolved at runtime; assign a real agent in the editor
            params: {
              task:
                "Write a short, engaging tweet (≤270 characters) about today's focus topic. " +
                "Be authentic, add value, include 1–2 relevant hashtags. Do NOT include quotation marks.",
              topic: "AI agents and automation", // user should customise this
              tone: "professional yet approachable",
            },
          },
          position: { x: 80, y: 160 },
        },
        {
          // Step 2 — human approval gate before posting publicly
          id: "approve",
          type: "user",
          data: {
            mode: "approval",
            message:
              "Please review the tweet below before it is published to X. " +
              "Approve to post, reject to cancel.\n\n${generate}",
            timeout: 60, // auto-approve after 60 minutes if nobody reviews
          },
          position: { x: 360, y: 160 },
        },
        {
          // Step 3 — post to X via the social-media skill
          id: "post",
          type: "skill",
          data: {
            skillName: "social-media",
            toolName: "post_to_x",
            agentId: undefined, // auto-resolved to a connected agent with social_media_posting capability
            params: {
              // The text field is wired to the generator's output.
              // The executor resolves ${generate} to the text from step 1.
              text: "${generate}",
            },
          },
          position: { x: 640, y: 160 },
        },
      ],
      edges: [
        {
          id: "generate->approve",
          source: "generate",
          target: "approve",
        },
        {
          id: "approve->post",
          source: "approve",
          target: "post",
        },
      ],
    },
  },
  // ── Existing templates ───────────────────────────────────────────────────
  {
    id: "template-code-analysis",
    name: "Code Analysis Pipeline",
    description: "Analyze code quality and suggest improvements",
    category: "analysis",
    definition: {
      nodes: [
        {
          id: "input",
          type: "agent",
          data: {
            agentId: "@mock-agent",
            params: {
              role: "code-reviewer",
              task: "Prepare code snippet for analysis",
              language: "typescript",
            },
          },
          position: { x: 50, y: 100 },
        },
        {
          id: "analysis",
          type: "agent",
          data: {
            agentId: "code-analyst",
            params: {
              input: "${input}",
              focus: "quality",
              checkFor: ["performance", "security", "maintainability"],
              severity: "high",
              maxIssues: 10,
            },
          },
          position: { x: 300, y: 100 },
        },
        {
          id: "summary",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${analysis}",
              format: "markdown",
              includeMetrics: true,
              suggestionsCount: 5,
              tone: "professional",
            },
          },
          position: { x: 550, y: 100 },
        },
      ],
      edges: [
        {
          id: "input->analysis",
          source: "input",
          target: "analysis",
        },
        {
          id: "analysis->summary",
          source: "analysis",
          target: "summary",
        },
      ],
    },
  },
  {
    id: "template-research-report",
    name: "Research & Report Generation",
    description: "Research a topic and generate a comprehensive report",
    category: "research",
    definition: {
      nodes: [
        {
          id: "research",
          type: "agent",
          data: {
            agentId: "researcher",
            params: {
              depth: "comprehensive",
              sources: "academic",
              researchHours: 4,
              topicsToExplore: 5,
            },
          },
          position: { x: 50, y: 100 },
        },
        {
          id: "compile",
          type: "agent",
          data: {
            agentId: "@mock-agent",
            params: {
              input: "${research}",
              task: "compile-data",
              organization: "by-topic",
              includeReferences: true,
              maxDataPoints: 100,
            },
          },
          position: { x: 300, y: 100 },
        },
        {
          id: "write",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${compile}",
              style: "academic",
              length: "comprehensive",
              includeAbstract: true,
              includeConclusion: true,
              citationFormat: "APA",
            },
          },
          position: { x: 550, y: 100 },
        },
      ],
      edges: [
        {
          id: "research->compile",
          source: "research",
          target: "compile",
        },
        {
          id: "compile->write",
          source: "compile",
          target: "write",
        },
      ],
    },
  },
  {
    id: "template-content-creation",
    name: "Content Creation Workflow",
    description: "Create and refine content for multiple platforms",
    category: "writing",
    definition: {
      nodes: [
        {
          id: "outline",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              task: "create-outline",
              contentType: "blog",
              targetAudience: "developers",
              sections: 5,
              detailLevel: "medium",
            },
          },
          position: { x: 50, y: 100 },
        },
        {
          id: "draft",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${outline}",
              task: "write-draft",
              expandOutline: true,
              includeExamples: true,
              tone: "friendly",
              wordCount: "1500-2000",
            },
          },
          position: { x: 300, y: 100 },
        },
        {
          id: "review",
          type: "agent",
          data: {
            agentId: "code-analyst",
            params: {
              input: "${draft}",
              focus: "clarity",
              checkGrammar: true,
              checkTone: true,
              improvability: true,
              suggestSectionCount: 10,
            },
          },
          position: { x: 550, y: 100 },
        },
        {
          id: "finalize",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${review}",
              task: "finalize",
              applyEdits: true,
              addSEO: true,
              formatMarkdown: true,
              addTOC: true,
            },
          },
          position: { x: 800, y: 100 },
        },
      ],
      edges: [
        {
          id: "outline->draft",
          source: "outline",
          target: "draft",
        },
        {
          id: "draft->review",
          source: "draft",
          target: "review",
        },
        {
          id: "review->finalize",
          source: "review",
          target: "finalize",
        },
      ],
    },
  },
  {
    id: "template-parallel-analysis",
    name: "Parallel Analysis",
    description: "Analyze data from multiple perspectives in parallel",
    category: "analysis",
    definition: {
      nodes: [
        {
          id: "input",
          type: "agent",
          data: {
            agentId: "@mock-agent",
            params: {
              task: "prepare-data",
              dataFormat: "json",
              normalize: true,
              maxSize: "10MB",
            },
          },
          position: { x: 50, y: 150 },
        },
        {
          id: "analyze-a",
          type: "agent",
          data: {
            agentId: "code-analyst",
            params: {
              input: "${input}",
              angle: "technical",
              focus: "code-quality",
              checkMetrics: true,
              reportDepth: "detailed",
            },
          },
          position: { x: 300, y: 50 },
        },
        {
          id: "analyze-b",
          type: "agent",
          data: {
            agentId: "researcher",
            params: {
              input: "${input}",
              angle: "strategic",
              focus: "business-impact",
              marketAnalysis: true,
              competitorComparison: true,
            },
          },
          position: { x: 300, y: 250 },
        },
        {
          id: "merge",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              inputA: "${analyze-a}",
              inputB: "${analyze-b}",
              task: "synthesize",
              integrationStyle: "side-by-side",
              includeConflicts: true,
              provideSummary: true,
            },
          },
          position: { x: 550, y: 150 },
        },
      ],
      edges: [
        {
          id: "input->analyze-a",
          source: "input",
          target: "analyze-a",
        },
        {
          id: "input->analyze-b",
          source: "input",
          target: "analyze-b",
        },
        {
          id: "analyze-a->merge",
          source: "analyze-a",
          target: "merge",
        },
        {
          id: "analyze-b->merge",
          source: "analyze-b",
          target: "merge",
        },
      ],
    },
  },
  {
    id: "template-conditional-workflow",
    name: "Conditional Processing",
    description: "Process data with conditional branching based on analysis",
    category: "automation",
    definition: {
      nodes: [
        {
          id: "analyze",
          type: "agent",
          data: {
            agentId: "code-analyst",
            params: {
              task: "evaluate",
              metrics: ["quality", "performance", "security"],
              threshold: 0.7,
              detailed: true,
            },
          },
          position: { x: 50, y: 150 },
        },
        {
          id: "check-quality",
          type: "condition",
          data: { input: "${analyze}", expression: "${analyze.quality} > 0.7" },
          position: { x: 300, y: 150 },
        },
        {
          id: "high-quality-path",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${check-quality}",
              task: "publish",
              environments: ["production"],
              notify: true,
              logSuccess: true,
            },
          },
          position: { x: 550, y: 50 },
        },
        {
          id: "low-quality-path",
          type: "agent",
          data: {
            agentId: "writer",
            params: {
              input: "${check-quality}",
              task: "revise",
              focusAreas: ["critical-issues"],
              autoFix: true,
              scheduleReview: true,
            },
          },
          position: { x: 550, y: 250 },
        },
      ],
      edges: [
        {
          id: "analyze->check",
          source: "analyze",
          target: "check-quality",
        },
        {
          id: "check->high",
          source: "check-quality",
          target: "high-quality-path",
          data: { label: "true" },
        },
        {
          id: "check->low",
          source: "check-quality",
          target: "low-quality-path",
          data: { label: "false" },
        },
      ],
    },
  },
];

/**
 * Get a template by ID
 */
export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get all templates or filter by category
 */
export function getTemplates(category?: string): WorkflowTemplate[] {
  if (category) {
    return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
  }
  return WORKFLOW_TEMPLATES;
}

/**
 * Get all unique categories
 */
export function getTemplateCategories(): string[] {
  const categories = new Set(WORKFLOW_TEMPLATES.map((t) => t.category));
  return Array.from(categories);
}
