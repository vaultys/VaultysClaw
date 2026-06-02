#!/usr/bin/env node
/**
 * Remove dark: mode variants from Tailwind classes (FIXED VERSION)
 * The adaptive theme system uses CSS variables that automatically invert
 * between light and dark modes, making dark: prefixes redundant
 */

const fs = require("fs");
const path = require("path");

const FILES_TO_UPDATE = [
  // Pages (app router)
  "packages/control-plane/app/about/page.tsx",
  "packages/control-plane/app/agents/[did]/page.tsx",
  "packages/control-plane/app/agents/page.tsx",
  "packages/control-plane/app/chat/page.tsx",
  "packages/control-plane/app/governance/page.tsx",
  "packages/control-plane/app/invite/[token]/page.tsx",
  "packages/control-plane/app/knowledge/page.tsx",
  "packages/control-plane/app/models/[id]/page.tsx",
  "packages/control-plane/app/page.tsx",
  "packages/control-plane/app/server/page.tsx",
  "packages/control-plane/app/setup/page.tsx",
  "packages/control-plane/app/skills/page.tsx",

  // Components
  "packages/control-plane/components/channels/MemberList.tsx",
  "packages/control-plane/components/channels/MessageInput.tsx",
  "packages/control-plane/components/channels/MessageList.tsx",
  "packages/control-plane/components/graph/views/Force3DView.tsx",
  "packages/control-plane/components/graph/views/HierarchyView.tsx",
  "packages/control-plane/components/graph/views/MatrixView.tsx",
  "packages/control-plane/components/graph/views/OrgChartFlowView.tsx",
  "packages/control-plane/components/layout/TopBar.tsx",
  "packages/control-plane/components/models/RegisterModelModal.tsx",
  "packages/control-plane/components/shared/Avatar.tsx",
  "packages/control-plane/components/signin/FirstConnect.tsx",
  "packages/control-plane/components/signin/Loader.tsx",
  "packages/control-plane/components/signin/LoginFlowDiagram.tsx",
  "packages/control-plane/components/signin/QRCodeScreen.tsx",
  "packages/control-plane/components/signin/SecurityTypeSelector.tsx",
  "packages/control-plane/components/social-media/SocialMediaTab.tsx",
  "packages/control-plane/components/users/InviteUserModal.tsx",
  "packages/control-plane/components/users/UserGrantsPanel.tsx",
  "packages/control-plane/components/wizard/SetupWizard.tsx",
  "packages/control-plane/components/workflow/ImportExportButtons.tsx",
  "packages/control-plane/components/workflow/nodes.tsx",
  "packages/control-plane/components/workflow/PropertiesPanel.tsx",
  "packages/control-plane/components/workflow/TemplateSelectionModal.tsx",
  "packages/control-plane/components/workflow/TitleDescriptionEditor.tsx",
  "packages/control-plane/components/workflow/WorkflowApprovalInbox.tsx",
  "packages/control-plane/components/workflow/WorkflowEditor.tsx",
  "packages/control-plane/components/workflow/WorkflowExecutionPanel.tsx",
  "packages/control-plane/components/workflow/WorkflowInputForm.tsx",
  "packages/control-plane/components/workflow/WorkflowRunModal.tsx",

  // Agent controller
  "packages/agent-controller/web-app/src/pages/ChatPanel.tsx",
  "packages/agent-controller/web-app/src/pages/Login.tsx",
];

/**
 * Remove dark: prefixes from className strings
 * Only matches complete dark:class-name patterns, preserves whitespace
 */
function removeDarkModifiers(content) {
  let result = content;

  // Match and remove " dark:className" patterns, BUT preserve newlines
  // This regex finds " dark:" followed by a valid Tailwind class name
  result = result.replace(/ dark:[a-zA-Z0-9\-\/\[\]#%.]+/g, "");

  // Match and remove "dark:className" at the beginning of a class list
  result = result.replace(/className="dark:/, 'className="');

  // Clean up any resulting double spaces (but NOT newlines)
  // This is safer: only replace space followed by space, not any whitespace
  result = result.replace(/  +/g, " ");

  return result;
}

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    let content = fs.readFileSync(fullPath, "utf-8");
    const originalContent = content;
    content = removeDarkModifiers(content);

    if (content !== originalContent) {
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`✅ Updated: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No changes: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log(
    "🌓 Removing dark: modifiers (theme handles dark mode automatically)...\n"
  );

  let updated = 0;
  let skipped = 0;

  for (const file of FILES_TO_UPDATE) {
    if (processFile(file)) {
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n📊 Cleanup complete:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`\n💾 Run 'pnpm format' to format the updated files.\n`);
  console.log(
    `ℹ️  Note: The adaptive theme CSS variables automatically invert`
  );
  console.log(
    `   between light and dark modes, making dark: prefixes redundant.`
  );
}

main();
