# Workflow Templates & Import/Export Architecture

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       WORKFLOWS PAGE                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Header Actions                                               │  │
│  │ ┌──────────────────┐  ┌──────────────────┐                  │  │
│  │ │ From Template    │  │ New Workflow     │                  │  │
│  │ └────────┬─────────┘  └──────────────────┘                  │  │
│  │          │                                                  │  │
│  └──────────┼──────────────────────────────────────────────────┘  │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ TemplateSelectionModal                                       │  │
│  │ ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐           │  │
│  │ │ All    │ │Analysis│ │ Writing  │ │ Research  │ ...       │  │
│  │ └────────┘ └────────┘ └──────────┘ └───────────┘           │  │
│  │                                                              │  │
│  │ ┌─────────────────────────────────────────────────────┐    │  │
│  │ │ Code Analysis │ Parallel │ Content │ Report │ ...  │    │  │
│  │ └─────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Bottom Right Corner                                          │  │
│  │ ┌──────────┐  ┌────────┐                                    │  │
│  │ │ Import   │  │ Export │                                    │  │
│  │ └──────────┘  └────────┘                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Workflows List with Edit/Delete actions...                       │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                       EDITOR PAGE                                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Header: [Back Button]         [Import] [Export]             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │          WorkflowEditor (React Flow Canvas)                 │  │
│  │                                                             │  │
│  │                        │                                    │  │
│  │     ┌──────────────────┼──────────────────┐               │  │
│  │     ▼                  ▼                   ▼               │  │
│  │  Properties          Execution                             │  │
│  │  Panel               Panel                                 │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Template Usage Flow
```
User clicks "From Template"
    │
    ▼
TemplateSelectionModal opens
    │
    ├─ GET /api/workflows/templates
    │    │
    │    ▼
    │  Display template list (15 templates)
    │    │
    │    ▼
    │ User selects template
    │    │
    └────▼ GET /api/workflows/templates/{templateId}
        │
        ▼
    Load template definition into store
        │
        ▼
    Navigate to /workflows/new
        │
        ▼
    User customizes and saves workflow
```

### Export Flow
```
User clicks "Export" button
    │
    ├─ Workflow must be saved (id required)
    │
    ▼
GET /api/workflows/{id}/export
    │
    ├─ Fetch workflow from database
    │ ├─ name
    │ ├─ description
    │ ├─ definition (JSON string)
    │
    ├─ Construct export data
    │ ├─ Add exportedAt timestamp
    │ ├─ Add version info
    │
    ├─ Set download headers
    │ ├─ Content-Disposition: attachment
    │ ├─ filename: workflow-{name}.json
    │
    ▼
JSON file downloads to user's device
```

### Import Flow
```
User clicks "Import" button
    │
    ▼
File picker dialog opens (*.json)
    │
    ▼
User selects JSON file
    │
    ▼
File is read and parsed
    │
    ▼
Validate structure
    ├─ Check name (required)
    ├─ Check definition (required)
    ├─ Check definition.nodes (array, required)
    ├─ Check definition.edges (array, required)
    │
    ├─ ✓ Valid: Continue
    └─ ✗ Invalid: Show error message
        │
        ▼
    POST /api/workflows/import
        │
        ├─ Save workflow to database
        ├─ Generate new ID
        ├─ Generate timestamp
        │
        ▼
    Return success with new workflow ID
        │
        ▼
    Show success message
        │
        ▼
    Refresh workflows list
```

## State Management

### Zustand Store Integration
```
useWorkflowStore()
    │
    ├─ clearWorkflow() ─→ When user starts fresh or clicks "From Template"
    │
    ├─ setWorkflow(id, name, description, definition) ─→ When template is loaded
    │
    ├─ setDefinition(definition) ─→ When user edits workflow
    │
    └─ workflowId ─→ Used to enable/disable Export button

Template Selection Process:
    Template Modal
        │
        ├─ Fetch template via API
        │
        ├─ Call clearWorkflow()
        │
        ├─ Call setWorkflow(id, name, description, definition)
        │
        └─ Navigate to /workflows/new
            │
            ▼
        Editor loads with template definition pre-filled
```

## Database Schema (Unchanged)

```
workflows table
├─ id (PK, UUID)
├─ name (string)
├─ description (text, nullable)
├─ definition (JSON string) ────────┐
├─ created_by (string, nullable)   │
├─ created_at (timestamp)          │
└─ updated_at (timestamp)          │
                                   │
                    JSON Structure │
                                   ▼
                    {
                      nodes: [{id, type, data, position?}],
                      edges: [{id, source, target, data?}]
                    }
```

## API Routes Summary

```
GET  /api/workflows/templates
     └─ Returns list of 5 available templates with metadata

GET  /api/workflows/templates/{templateId}
     └─ Returns complete template definition for loading

GET  /api/workflows/{id}/export
     └─ Returns workflow as JSON file (download)

POST /api/workflows/import
     └─ Accepts JSON, validates, saves as new workflow
```

## Component Interaction

```
Workflows Page
├─ Shows workflow list
├─ Import/Export buttons at bottom
│  └─ ImportExportButtons component
│     ├─ Upload input (hidden)
│     ├─ OnImportComplete callback
│     └─ WorkflowId for export control
│
├─ Template button at top
│  └─ TemplateSelectionModal component
│     ├─ Fetches templates on open
│     ├─ Category filtering
│     ├─ onClick handler → handleSelectTemplate
│     └─ Calls setWorkflow() and navigates
│
└─ Integration with Zustand store
   ├─ clearWorkflow()
   ├─ setWorkflow()
   └─ workflowId accessor

Editor Page
├─ ImportExportButtons in header
│  ├─ workflowId passed (only enable if saved)
│  └─ onImportComplete refreshes list
│
└─ All workflow editing features
   ├─ Canvas (React Flow)
   ├─ Properties panel
   ├─ Execution controls
   └─ Save/Execute buttons
```

## Feature Parity

Both Import and Export buttons appear in:
- ✓ Workflows list page (bottom corner)
- ✓ Editor page (header)

Template selection available in:
- ✓ Workflows list page (primary way)
- Workflows list "New Workflow" button uses blank template

Export enabled:
- ✓ Only when workflow is saved (has ID)
- ✓ Disabled state with tooltip

Import always available:
- ✓ From anywhere to add new workflows
- ✓ Auto-refresh after successful import
