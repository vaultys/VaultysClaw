#!/usr/bin/env node
/**
 * Color migration script: Replace arbitrary Tailwind colors with theme colors
 * Maps old Tailwind colors to the new adaptive theme (primary, secondary, success, warning, danger, neutral, background, foreground)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Color mapping: Tailwind colors → Theme colors
const COLOR_MAPPING = {
  // Indigo/Blue/Cyan → Primary (Indigo)
  indigo: "primary",
  blue: "primary",
  cyan: "primary",
  sky: "primary",

  // Purple → Secondary (Violet)
  purple: "secondary",
  violet: "secondary",
  fuchsia: "secondary",

  // Green/Emerald → Success (Emerald)
  green: "success",
  emerald: "success",
  teal: "success",
  lime: "success",

  // Amber/Yellow/Orange → Warning (Amber)
  amber: "warning",
  yellow: "warning",
  orange: "warning",

  // Red/Pink/Rose → Danger (Red)
  red: "danger",
  pink: "danger",
  rose: "danger",

  // Gray/Slate/Stone → Neutral (Zinc)
  gray: "neutral",
  slate: "neutral",
  stone: "neutral",
  zinc: "neutral",
};

// Files to migrate
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
];

function createColorRegex(oldColor) {
  // Match patterns like: bg-indigo-500, text-indigo-500/30, dark:bg-indigo-900, etc.
  return new RegExp(
    `\\b(bg|text|border|fill|stroke|ring|outline|shadow|divide|placeholder|caret|accent|from|via|to|ring-offset)(?:-(${oldColor}))(?:-(50|100|200|300|400|500|600|700|800|900|950))?(?:(/\\d+))?\\b`,
    "g"
  );
}

function replaceColors(content) {
  let result = content;

  // Replace each color mapping
  for (const [oldColor, newColor] of Object.entries(COLOR_MAPPING)) {
    const regex = createColorRegex(oldColor);
    result = result.replace(regex, (match, prefix, color, level, opacity) => {
      // Preserve the level and opacity if present
      const levelPart = level ? `-${level}` : "";
      const opacityPart = opacity || "";
      return `${prefix}-${newColor}${levelPart}${opacityPart}`;
    });
  }

  // Special case for dark: prefix
  for (const [oldColor, newColor] of Object.entries(COLOR_MAPPING)) {
    const darkRegex = new RegExp(
      `\\bdark:(bg|text|border|fill|stroke|ring|outline|shadow|divide|placeholder|caret|accent|from|via|to|ring-offset)-(${oldColor})-(50|100|200|300|400|500|600|700|800|900|950)\\b`,
      "g"
    );
    result = result.replace(darkRegex, (match, prefix, color, level) => {
      return `dark:${prefix}-${newColor}-${level}`;
    });
  }

  // Replace inline style hex colors with theme variables (only for known patterns)
  // This is more conservative - we only replace obvious patterns
  result = result.replace(/#6366f1/g, "primary"); // indigo-500
  result = result.replace(/#4f46e5/g, "primary-600"); // indigo-600
  result = result.replace(/#0ea5e9/g, "primary"); // cyan-500
  result = result.replace(/#22c55e/g, "success"); // green-500
  result = result.replace(/#f59e0b/g, "warning"); // amber-500
  result = result.replace(/#ef4444/g, "danger"); // red-500

  return result;
}

function migrateFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return false;
  }

  try {
    let content = fs.readFileSync(fullPath, "utf-8");
    const originalContent = content;
    content = replaceColors(content);

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
  console.log("🎨 Starting color migration...\n");

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of FILES_TO_UPDATE) {
    if (migrateFile(file)) {
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n📊 Migration complete:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n💾 Run 'pnpm format' to format the updated files.`);
}

main();
