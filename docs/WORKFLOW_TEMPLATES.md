# Workflow Templates, Export & Import

## Overview

VaultyscLaw now includes three powerful features for managing workflows:

1. **Workflow Templates** - Pre-built workflow definitions to jumpstart your automation
2. **Workflow Export** - Export workflows as JSON files for sharing and backup
3. **Workflow Import** - Import workflows from JSON files to quickly set up new automations

## Workflow Templates

### Available Templates

The system includes 5 pre-built templates across different categories:

#### Analysis Category

- **Code Analysis Pipeline** - Analyze code quality and suggest improvements
- **Parallel Analysis** - Analyze data from multiple perspectives in parallel

#### Writing Category

- **Content Creation Workflow** - Create and refine content for multiple platforms

#### Research Category

- **Research & Report Generation** - Research a topic and generate a comprehensive report

#### Automation Category

- **Conditional Processing** - Process data with conditional branching based on analysis

### Using Templates

#### Via UI

1. Click the **"From Template"** button on the Workflows page
2. Browse available templates organized by category
3. Click on a template to load it into the editor
4. Customize the workflow as needed
5. Save your new workflow

#### Programmatically

```typescript
import { getTemplate, getTemplates } from "@/lib/workflow-templates";

// Get a specific template
const template = getTemplate("template-code-analysis");

// Get all templates
const allTemplates = getTemplates();

// Get templates by category
const analysisTemplates = getTemplates("analysis");
```

### Template API Endpoints

#### Get All Templates

```bash
GET /api/workflows/templates
```

**Query Parameters:**

- `category` (optional) - Filter by category (analysis, writing, research, automation)

**Response:**

```json
{
  "success": true,
  "templates": [
    {
      "id": "template-code-analysis",
      "name": "Code Analysis Pipeline",
      "description": "Analyze code quality and suggest improvements",
      "category": "analysis",
      "icon": "📊"
    }
  ]
}
```

#### Get Specific Template

```bash
GET /api/workflows/templates/{templateId}
```

**Response:**

```json
{
  "success": true,
  "template": {
    "id": "template-code-analysis",
    "name": "Code Analysis Pipeline",
    "description": "Analyze code quality and suggest improvements",
    "category": "analysis",
    "definition": {
      "nodes": [...],
      "edges": [...]
    }
  }
}
```

## Workflow Export

### Export Features

- Export any saved workflow as a JSON file
- Includes workflow name, description, and complete definition
- Easy sharing with team members
- Backup your important workflows

### Using Export

#### Via UI

1. Open a workflow in the editor
2. Click the **"Export"** button in the header
3. A JSON file will download automatically

#### Exported File Format

```json
{
  "name": "My Workflow",
  "description": "Optional description",
  "definition": {
    "nodes": [...],
    "edges": [...]
  },
  "exportedAt": "2026-05-13T18:31:00.000Z",
  "version": "1.0"
}
```

### Export API Endpoint

```bash
GET /api/workflows/{workflowId}/export
```

**Response:** JSON file with Content-Disposition header set to attachment

## Workflow Import

### Import Features

- Import workflows from JSON files
- Supports files exported from VaultyscLaw
- Validates workflow structure before saving
- Preserves all workflow metadata

### Using Import

#### Via Workflows List Page

1. Click the **"Import"** button in the bottom-right corner
2. Select a JSON workflow file from your computer
3. The workflow will be imported and added to your list
4. The Workflows page will refresh automatically

#### Via Upload

1. Choose a workflow JSON file from your device
2. System validates the file structure
3. Workflow is saved with the original name
4. Navigate to the new workflow to edit it

### Import API Endpoint

```bash
POST /api/workflows/import
```

**Request Body:**

```json
{
  "name": "Imported Workflow",
  "description": "Optional description",
  "definition": {
    "nodes": [...],
    "edges": [...]
  }
}
```

**Response:**

```json
{
  "success": true,
  "id": "workflow-uuid",
  "message": "Workflow \"Imported Workflow\" imported successfully"
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Missing required fields: name, definition"
}
```

### Validation Rules

- `name` (required): Non-empty string
- `description` (optional): String
- `definition` (required): Object with:
  - `nodes`: Array of node objects
  - `edges`: Array of edge objects

## Use Cases

### Team Collaboration

1. Create a workflow for a common task
2. Export it as JSON
3. Share the file with team members
4. They import it into their account

### Backup & Recovery

1. Regularly export important workflows
2. Store backups in version control or cloud storage
3. Import to restore if needed

### Workflow Patterns

1. Use templates as starting points for new workflows
2. Customize templates for your specific needs
3. Export customized workflows to reuse later

### Workflow Migration

1. Export workflows from one environment
2. Import into another environment
3. Useful for moving between development/production

## Examples

### Creating Workflow from Template + Export

```typescript
// 1. Load template
const template = getTemplate("template-code-analysis");

// 2. Create workflow from template
const workflowId = saveWorkflow("My Code Analysis", template.definition);

// 3. User exports in UI via Export button
// File downloads as "workflow-my-code-analysis.json"
```

### Import from File

```typescript
// User selects file: exported-workflow.json
const data = {
  name: "Imported Code Analyzer",
  description: "Customized for our project",
  definition: {
    /* workflow definition */
  },
};

// POST to /api/workflows/import
const response = await fetch("/api/workflows/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const result = await response.json();
// result.id contains the new workflow ID
```

## Technical Details

### Template Storage

- Templates are defined in `packages/control-plane/lib/workflow-templates.ts`
- No database storage required
- Can be extended by adding entries to `WORKFLOW_TEMPLATES` array

### Template Structure

```typescript
interface WorkflowTemplate {
  id: string; // Unique identifier
  name: string; // Display name
  description: string; // User-friendly description
  category: "analysis" | "writing" | "research" | "automation";
  definition: WorkflowDefinition; // The actual workflow
  icon?: string; // Optional emoji/icon
}
```

### Export/Import Safety

- File format validation before import
- Definition structure validation (must have nodes and edges arrays)
- Workflow ID and timestamps generated on import (not preserved)
- Works with workflows of any complexity level

## Testing

All functionality is covered by tests:

- 5 templates defined and validated
- 15 test cases for templates, export, and import
- Verification of structure preservation
- Error handling and edge cases

Run tests:

```bash
npx vitest run __tests__/workflows-templates.test.ts
```

## Future Enhancements

Potential improvements to consider:

- Template versioning and updates
- Community template library/marketplace
- Template sharing with visibility controls
- Import history tracking
- Workflow comparison tools
- Template categories customization
