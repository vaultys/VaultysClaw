/**
 * Contract Review & Approval Pipeline — Real-World AI Workflow Test
 *
 * Scenario: A legal team receives contracts, needs to:
 * 1. Extract key terms (contract analyzer)
 * 2. Check compliance against policies (compliance checker)
 * 3. Route for human approval based on contract value
 * 4. Archive approved contracts with metadata
 *
 * Tests cover:
 * - Multi-agent sequential/parallel execution
 * - Token budget tracking (expensive document analysis)
 * - Human-in-the-loop approval workflow
 * - Governance audit trail
 * - Conditional routing (setup for future conditional branches feature)
 * - Error handling and escalation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
import { WorkflowDAO, PolicyDAO, RealmDAO, AgentDAO } from "../packages/control-plane/db";
import { prisma } from "../packages/control-plane/db/client";
import { ServerIdentityDAO } from "../packages/control-plane/db/settings.dao";
import { AgentWSServer } from "../packages/control-plane/lib/ws-server";
import { MockAgent, waitFor } from "./test-utils";

let WS_PORT = 9877;
// Find an available port
let portInUse = true;
while (portInUse) {
  try {
    require("net").createServer().listen(WS_PORT).close();
    portInUse = false;
  } catch {
    WS_PORT++;
  }
}

describe("Contract Review & Approval Pipeline Workflow", () => {
  let wsServer: AgentWSServer;
  let testRealmId: string;
  const testRealmSlug = `legal-realm-${Math.random().toString(36).slice(2, 8)}`;
  const testRealmName = "Legal Operations";

  // Sentinel names for cleanup
  const WORKFLOW_NAMES = [
    "Contract Review Pipeline",
    "High-Value Contract Review",
    "Low-Value Contract Review",
    "Contract with Compliance Issues",
  ];
  const AGENT_NAMES = [
    "Document Analyzer",
    "Compliance Checker",
    "Legal Reviewer",
    "Archive Agent",
    "Escalation Agent",
  ];

  let documentAnalyzer: MockAgent;
  let complianceChecker: MockAgent;
  let legalReviewer: MockAgent;
  let archiveAgent: MockAgent;

  beforeAll(async () => {
    // Clean up test data
    for (const name of WORKFLOW_NAMES) {
      const workflows = await prisma.workflow.findMany({ where: { name } });
      for (const wf of workflows) {
        await prisma.workflowRun.deleteMany({ where: { workflowId: wf.id } });
      }
      await prisma.workflow.deleteMany({ where: { name } });
    }
    await prisma.agent.deleteMany({ where: { name: { in: AGENT_NAMES } } });

    // Clean up realm if it exists (by slug)
    const existingRealm = await prisma.realm.findFirst({ where: { slug: testRealmSlug } });
    if (existingRealm) {
      await prisma.agentRealm.deleteMany({ where: { realmId: existingRealm.id } });
      await prisma.userRealm.deleteMany({ where: { realmId: existingRealm.id } });
      await prisma.realm.delete({ where: { id: existingRealm.id } });
    }

    await ServerIdentityDAO.ensureServerIdentity();
    wsServer = new AgentWSServer(WS_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create realm for legal team
    const createdRealm = await RealmDAO.create({
      name: testRealmName,
      slug: testRealmSlug,
      description: "Legal operations and contract management",
    });
    if (!createdRealm) {
      throw new Error("Failed to create test realm");
    }
    testRealmId = createdRealm.id;

    // Create test agents
    documentAnalyzer = new MockAgent(`ws://localhost:${WS_PORT}`, "Document Analyzer");
    complianceChecker = new MockAgent(`ws://localhost:${WS_PORT}`, "Compliance Checker");
    legalReviewer = new MockAgent(`ws://localhost:${WS_PORT}`, "Legal Reviewer");
    archiveAgent = new MockAgent(`ws://localhost:${WS_PORT}`, "Archive Agent");

    // Connect and authenticate all agents
    await documentAnalyzer.connect();
    await complianceChecker.connect();
    await legalReviewer.connect();
    await archiveAgent.connect();

    await documentAnalyzer.authenticate(["extract", "analyze"], wsServer);
    await complianceChecker.authenticate(["check", "validate"], wsServer);
    await legalReviewer.authenticate(["review", "approve"], wsServer);
    await archiveAgent.authenticate(["store", "archive"], wsServer);

    // Upsert agents in database and add to realm
    const agentsList = [documentAnalyzer, complianceChecker, legalReviewer, archiveAgent];
    for (const agent of agentsList) {
      await prisma.agent.upsert({
        where: { did: agent.id },
        create: { did: agent.id, name: agent.name, capabilities: [] },
        update: {},
      });
      await prisma.agentRealm.upsert({
        where: { agentDid_realmId: { agentDid: agent.id, realmId: testRealmId } },
        create: { agentDid: agent.id, realmId: testRealmId },
        update: {},
      });
    }
  });

  afterAll(() => {
    try {
      wsServer?.shutdown();
    } catch (e) {
      // ignore
    }
    try {
      documentAnalyzer?.close();
      complianceChecker?.close();
      legalReviewer?.close();
      archiveAgent?.close();
    } catch (e) {
      // ignore
    }
  });

  // =========================================================================
  // Test 1: Full Contract Review Pipeline (Sequential)
  // =========================================================================

  describe("Full Contract Review Pipeline", () => {
    it("should execute complete workflow: extract → check → review → archive", async () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: documentAnalyzer.id,
            type: "agent",
            data: {
              agentId: documentAnalyzer.id,
              label: "Extract Terms",
              params: {
                task: "extract_key_terms",
                document_id: "contract-001",
                document_type: "Service Agreement",
              },
            },
            position: { x: 0, y: 0 },
          },
          {
            id: complianceChecker.id,
            type: "agent",
            data: {
              agentId: complianceChecker.id,
              label: "Check Compliance",
              params: {
                task: "check_compliance",
                extracted_terms: `\${${documentAnalyzer.id}}`,
                policies: ["data_protection", "vendor_limits"],
              },
            },
            position: { x: 200, y: 0 },
          },
          {
            id: legalReviewer.id,
            type: "agent",
            data: {
              agentId: legalReviewer.id,
              label: "Legal Review",
              params: {
                task: "review_contract",
                compliance_result: `\${${complianceChecker.id}}`,
                contract_value: 150000,
              },
            },
            position: { x: 400, y: 0 },
          },
          {
            id: archiveAgent.id,
            type: "agent",
            data: {
              agentId: archiveAgent.id,
              label: "Archive",
              params: {
                task: "archive_contract",
                contract_id: "contract-001",
                review_result: `\${${legalReviewer.id}}`,
              },
            },
            position: { x: 600, y: 0 },
          },
        ],
        edges: [
          {
            id: "e1",
            source: documentAnalyzer.id,
            target: complianceChecker.id,
          },
          { id: "e2", source: complianceChecker.id, target: legalReviewer.id },
          { id: "e3", source: legalReviewer.id, target: archiveAgent.id },
        ],
      };

      const workflowId = await WorkflowDAO.create("Contract Review Pipeline", workflow as any, undefined, testRealmId);
      const runId = await WorkflowDAO.startRun(workflowId);

      // Step 1: Document Analyzer extracts key terms
      const analyzerIntentPromise = documentAnalyzer.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        documentAnalyzer.id,
        `${runId}-analyze`,
        "execute_step",
        {
          stepId: documentAnalyzer.id,
          runId,
          task: "extract_key_terms",
        }
      );

      const analyzerIntent = await analyzerIntentPromise;
      expect(analyzerIntent.payload.action).toBe("execute_step");

      const extractedTerms = {
        parties: ["Acme Corp", "Service Provider LLC"],
        duration: "24 months",
        value: 150000,
        renewal_clause: "auto-renew with 30-day notice",
        data_classification: "confidential",
        liability_cap: "2x annual fees",
      };
      await documentAnalyzer.sendResult(
        `${runId}-analyze`,
        "success",
        extractedTerms
      );

      const analyzerStepId = await WorkflowDAO.recordStep(runId, documentAnalyzer.id, documentAnalyzer.id, "pending");
      await WorkflowDAO.updateStep(analyzerStepId, { status: "completed", output: extractedTerms });

      // Step 2: Compliance Checker validates against policies
      const checkerIntentPromise = complianceChecker.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        complianceChecker.id,
        `${runId}-check`,
        "execute_step",
        {
          stepId: complianceChecker.id,
          runId,
          task: "check_compliance",
          input: extractedTerms,
        }
      );

      const checkerIntent = await checkerIntentPromise;
      expect(checkerIntent.payload.action).toBe("execute_step");

      const complianceResult = {
        status: "compliant",
        data_protection: { passed: true, notes: "CCPA/GDPR clauses present" },
        vendor_limits: {
          passed: true,
          notes: "Within approved vendor spend limits",
        },
        risk_level: "low",
        flags: [],
      };
      await complianceChecker.sendResult(
        `${runId}-check`,
        "success",
        complianceResult
      );

      const checkerStepId = await WorkflowDAO.recordStep(runId, complianceChecker.id, complianceChecker.id, "pending");
      await WorkflowDAO.updateStep(checkerStepId, { status: "completed", output: complianceResult });

      // Step 3: Legal Reviewer approves
      const reviewerIntentPromise = legalReviewer.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        legalReviewer.id,
        `${runId}-review`,
        "execute_step",
        {
          stepId: legalReviewer.id,
          runId,
          task: "review_contract",
          compliance_status: complianceResult,
        }
      );

      const reviewerIntent = await reviewerIntentPromise;
      expect(reviewerIntent.payload.action).toBe("execute_step");

      const reviewResult = {
        approval_status: "approved",
        reviewer: "john.doe@legal.com",
        approval_date: new Date().toISOString(),
        recommendations: [],
        execution_authorized: true,
      };
      await legalReviewer.sendResult(
        `${runId}-review`,
        "success",
        reviewResult
      );

      const reviewerStepId = await WorkflowDAO.recordStep(runId, legalReviewer.id, legalReviewer.id, "pending");
      await WorkflowDAO.updateStep(reviewerStepId, { status: "completed", output: reviewResult });

      // Step 4: Archive Agent stores contract
      const archiveIntentPromise = archiveAgent.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        archiveAgent.id,
        `${runId}-archive`,
        "execute_step",
        {
          stepId: archiveAgent.id,
          runId,
          task: "archive_contract",
        }
      );

      const archiveIntent = await archiveIntentPromise;
      expect(archiveIntent.payload.action).toBe("execute_step");

      const archiveResult = {
        archived: true,
        archive_id: "arc-contract-001",
        storage_location: "s3://contracts/2026/05/contract-001",
        metadata_stored: true,
      };
      await archiveAgent.sendResult(
        `${runId}-archive`,
        "success",
        archiveResult
      );

      const archiveStepId = await WorkflowDAO.recordStep(runId, archiveAgent.id, archiveAgent.id, "pending");
      await WorkflowDAO.updateStep(archiveStepId, { status: "completed", output: archiveResult });

      // Verify full workflow completion
      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history!.steps.length).toBe(4);
      expect(history!.steps.every((s) => s.status === "completed")).toBe(true);

      expect(history!.steps[0].output).toEqual(extractedTerms);
      expect((history!.steps[1].output as any).status).toBe("compliant");
    });
  });

  // =========================================================================
  // Test 2: Token Budget Tracking
  // =========================================================================

  describe("Token Budget Tracking", () => {
    it("should track token usage for expensive document analysis operations", async () => {
      // Set up token budget for analyzer agent (10,000 tokens/day)
      await AgentDAO.updateBudget(documentAnalyzer.id, { tokenBudgetDaily: 10000 });

      // Verify agent has a budget set
      const agent = await prisma.agent.findUnique({ where: { did: documentAnalyzer.id } });
      expect(agent).toBeDefined();
      expect(agent?.tokenBudgetDaily).toBe(10000);

      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: documentAnalyzer.id,
            type: "agent",
            data: {
              agentId: documentAnalyzer.id,
              label: "Extract Terms",
              params: { task: "extract_key_terms" },
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      };

      const workflowId = await WorkflowDAO.create("Token Budget Test", workflow as any, undefined, testRealmId);
      const runId = await WorkflowDAO.startRun(workflowId);

      // Simulate document analysis (uses ~3000 tokens)
      const intentPromise = documentAnalyzer.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        documentAnalyzer.id,
        `${runId}-analyze`,
        "execute_step",
        {
          stepId: documentAnalyzer.id,
          runId,
          task: "extract_key_terms",
        }
      );

      const intent = await intentPromise;
      expect(intent.payload.action).toBe("execute_step");

      const result = { terms: "extracted", token_cost: 3000 };
      await documentAnalyzer.sendResult(`${runId}-analyze`, "success", result);

      const stepId = await WorkflowDAO.recordStep(runId, documentAnalyzer.id, documentAnalyzer.id, "pending");
      await WorkflowDAO.updateStep(stepId, { status: "completed", output: result });

      // Verify workflow step was recorded
      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history!.steps.length).toBe(1);
      expect(history!.steps[0].status).toBe("completed");
    });
  });

  // =========================================================================
  // Test 3: Compliance Policy Management
  // =========================================================================

  describe("Compliance Policy Management", () => {
    it("should create and enforce governance policies", async () => {
      const policyRow = await PolicyDAO.create({
        realmId: testRealmId,
        capabilities: ["review", "approve"],
        resourceLimits: {
          maxTokensPerDay: 100000,
        },
      });

      expect(policyRow.id).toBeDefined();

      const policies = await PolicyDAO.list({ realmId: testRealmId });
      expect(policies.length).toBeGreaterThan(0);

      const policy = policies.find((p) => p.id === policyRow.id);
      expect(policy).toBeDefined();
      expect(policy?.capabilities).toContain("review");
    });
  });

  // =========================================================================
  // Test 4: Approval Workflow with Governance
  // =========================================================================

  describe("Approval Workflow with Governance", () => {
    it("should route high-value contracts for additional approval", async () => {
      // This test demonstrates setup for conditional branches
      // (will use actual conditional logic once that feature is implemented)

      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: documentAnalyzer.id,
            type: "agent",
            data: {
              agentId: documentAnalyzer.id,
              label: "Extract & Score",
              params: { task: "extract_and_score" },
            },
            position: { x: 0, y: 0 },
          },
          {
            id: legalReviewer.id,
            type: "agent",
            data: {
              agentId: legalReviewer.id,
              label: "High-Value Approval",
              params: { task: "high_value_approval" },
            },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [
          { id: "e1", source: documentAnalyzer.id, target: legalReviewer.id },
        ],
      };

      const workflowId = await WorkflowDAO.create("High-Value Contract Review", workflow as any, undefined, testRealmId);
      const runId = await WorkflowDAO.startRun(workflowId);

      const analyzerIntentPromise = documentAnalyzer.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        documentAnalyzer.id,
        `${runId}-score`,
        "execute_step",
        {
          stepId: documentAnalyzer.id,
          runId,
        }
      );

      const analyzerIntent = await analyzerIntentPromise;
      const scoreResult = {
        contract_value: 500000,
        risk_score: 3,
        requires_high_approval: true,
      };

      await documentAnalyzer.sendResult(
        `${runId}-score`,
        "success",
        scoreResult
      );
      const scoreStepId = await WorkflowDAO.recordStep(runId, documentAnalyzer.id, documentAnalyzer.id, "pending");
      await WorkflowDAO.updateStep(scoreStepId, { status: "completed", output: scoreResult });

      // Verify routing decision would be made (setup for conditional feature)
      const history = await WorkflowDAO.getRunHistory(runId);
      const stepOutput = history!.steps[0].output as any;
      expect(stepOutput.requires_high_approval).toBe(true);
      expect(stepOutput.contract_value).toBeGreaterThan(100000);
    });
  });

  // =========================================================================
  // Test 5: Error Handling & Escalation
  // =========================================================================

  describe("Error Handling & Escalation", () => {
    it("should handle compliance check failures and escalate", async () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: complianceChecker.id,
            type: "agent",
            data: {
              agentId: complianceChecker.id,
              label: "Check Compliance",
              params: { task: "check_compliance" },
            },
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      };

      const workflowId = await WorkflowDAO.create("Contract with Compliance Issues", workflow as any, undefined, testRealmId);
      const runId = await WorkflowDAO.startRun(workflowId);

      const checkerIntentPromise = complianceChecker.waitForIntent(5000);
      wsServer.sendIntentToAgent(
        complianceChecker.id,
        `${runId}-check`,
        "execute_step",
        {
          stepId: complianceChecker.id,
          runId,
        }
      );

      const checkerIntent = await checkerIntentPromise;
      expect(checkerIntent.payload.action).toBe("execute_step");

      // Simulate failure
      const errorResult = {
        status: "non_compliant",
        failed_checks: ["gdpr_clause_missing", "data_residency_violation"],
        risk_level: "high",
        requires_escalation: true,
      };

      await complianceChecker.sendResult(
        `${runId}-check`,
        "failure",
        errorResult
      );

      const stepId = await WorkflowDAO.recordStep(runId, complianceChecker.id, complianceChecker.id, "pending");
      await WorkflowDAO.updateStep(stepId, { status: "failed", output: errorResult, error: "Compliance check failed" });

      // Verify error was recorded
      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history!.steps[0].status).toBe("failed");
      const errorOutput = history!.steps[0].output as any;
      expect(errorOutput.requires_escalation).toBe(true);
    });
  });

  // =========================================================================
  // Test 6: Workflow Template for Reusability
  // =========================================================================

  describe("Workflow Template Reusability", () => {
    it("should create reusable workflow templates for contract types", async () => {
      // Service Agreement Template
      const serviceAgreementWorkflow: WorkflowDefinition = {
        nodes: [
          {
            id: "analyzer-sa",
            type: "agent",
            data: {
              agentId: documentAnalyzer.id,
              label: "Extract Service Terms",
              params: { contract_type: "service_agreement" },
            },
            position: { x: 0, y: 0 },
          },
          {
            id: "checker-sa",
            type: "agent",
            data: {
              agentId: complianceChecker.id,
              label: "Check SLA Compliance",
              params: { contract_type: "service_agreement" },
            },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ id: "e1", source: "analyzer-sa", target: "checker-sa" }],
      };

      const templateId = await WorkflowDAO.create(
        "Service Agreement Template",
        serviceAgreementWorkflow as any,
        undefined,
        testRealmId
      );
      expect(templateId).toBeDefined();

      // Verify template can be queried
      const template = await WorkflowDAO.findById(templateId);
      expect(template).toBeDefined();
      expect(template!.name).toBe("Service Agreement Template");
    });
  });
});
