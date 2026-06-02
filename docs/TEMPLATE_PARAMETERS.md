# Workflow Template Parameters Guide

## Overview

All workflow templates come pre-configured with realistic parameters that you can customize for your specific use case. Each parameter is editable directly in the workflow editor's Properties Panel.

---

## 1. Code Analysis Pipeline

**Purpose**: Analyze code quality and suggest improvements

### Input Node Parameters

- `role` - Code reviewer role/perspective
- `task` - Description of what to analyze
- `language` - Programming language (e.g., typescript, python, javascript)

### Analysis Node Parameters

- `focus` - What to focus on (quality, performance, etc.)
- `checkFor` - Array of checks to perform
  - `["performance", "security", "maintainability"]`
- `severity` - Severity level filter (critical, high, medium, low)
- `maxIssues` - Maximum number of issues to report

### Summary Node Parameters

- `format` - Output format (markdown, html, json)
- `includeMetrics` - Include code metrics (true/false)
- `suggestionsCount` - Number of improvement suggestions
- `tone` - Writing tone (professional, casual, technical)

---

## 2. Research & Report Generation

**Purpose**: Research a topic and generate a comprehensive report

### Research Node Parameters

- `depth` - Research depth (quick, standard, comprehensive)
- `sources` - Source types (academic, news, industry, all)
- `researchHours` - Time to spend on research (1-8 hours)
- `topicsToExplore` - Number of related topics to cover

### Compile Node Parameters

- `task` - Compilation task description
- `organization` - How to organize data (by-topic, by-source, by-importance)
- `includeReferences` - Include source citations (true/false)
- `maxDataPoints` - Maximum number of data points to include

### Write Node Parameters

- `style` - Writing style (academic, journalistic, technical, casual)
- `length` - Report length (brief, standard, comprehensive)
- `includeAbstract` - Add abstract/summary section (true/false)
- `includeConclusion` - Add conclusion section (true/false)
- `citationFormat` - Citation style (APA, MLA, Chicago, Harvard)

---

## 3. Content Creation Workflow

**Purpose**: Create and refine content for multiple platforms

### Outline Node Parameters

- `task` - Task description (create-outline)
- `contentType` - Type of content (blog, article, tutorial, guide)
- `targetAudience` - Intended audience (developers, managers, general)
- `sections` - Number of main sections (3-10)
- `detailLevel` - Detail level (minimal, medium, detailed)

### Draft Node Parameters

- `task` - Task description (write-draft)
- `expandOutline` - Expand outline into full draft (true/false)
- `includeExamples` - Add code/practical examples (true/false)
- `tone` - Writing tone (friendly, formal, technical, conversational)
- `wordCount` - Target word count range (e.g., "1500-2000")

### Review Node Parameters

- `focus` - Review focus (clarity, consistency, accuracy, engagement)
- `checkGrammar` - Check for grammar issues (true/false)
- `checkTone` - Verify appropriate tone (true/false)
- `improvability` - Suggest improvements (true/false)
- `suggestSectionCount` - Number of suggestions to provide

### Finalize Node Parameters

- `task` - Task description (finalize)
- `applyEdits` - Apply suggested edits (true/false)
- `addSEO` - Add SEO optimization (true/false)
- `formatMarkdown` - Format as markdown (true/false)
- `addTOC` - Add table of contents (true/false)

---

## 4. Parallel Analysis

**Purpose**: Analyze data from multiple perspectives in parallel

### Input Node Parameters

- `task` - Preparation task description
- `dataFormat` - Input data format (json, csv, xml, text)
- `normalize` - Normalize data format (true/false)
- `maxSize` - Maximum file size (e.g., "10MB", "100MB")

### Technical Analysis Node Parameters

- `angle` - Analysis perspective (technical)
- `focus` - Specific focus area (code-quality, performance, security)
- `checkMetrics` - Include metrics analysis (true/false)
- `reportDepth` - Report detail level (summary, detailed, comprehensive)

### Strategic Analysis Node Parameters

- `angle` - Analysis perspective (strategic)
- `focus` - Specific focus area (business-impact, market-fit)
- `marketAnalysis` - Include market analysis (true/false)
- `competitorComparison` - Compare with competitors (true/false)

### Merge Node Parameters

- `task` - Task description (synthesize)
- `integrationStyle` - How to combine results (side-by-side, integrated, comparative)
- `includeConflicts` - Note where analyses disagree (true/false)
- `provideSummary` - Provide combined summary (true/false)

---

## 5. Conditional Processing

**Purpose**: Process data with conditional branching based on analysis

### Analyze Node Parameters

- `task` - Analysis task description
- `metrics` - Metrics to evaluate (array of metric names)
- `threshold` - Quality threshold (0.0-1.0)
- `detailed` - Include detailed analysis (true/false)

### Condition Node Parameters

- `expression` - JavaScript expression for branching
  - Default: `output.quality > 0.7`
  - Can be customized based on your metrics

### High Quality Path Parameters

- `task` - Task when condition is true (publish)
- `environments` - Deployment environments (["production"], ["staging"], etc.)
- `notify` - Send notifications (true/false)
- `logSuccess` - Log successful execution (true/false)

### Low Quality Path Parameters

- `task` - Task when condition is false (revise)
- `focusAreas` - Areas to focus on during revision (["critical-issues"], etc.)
- `autoFix` - Auto-fix common issues (true/false)
- `scheduleReview` - Schedule for later review (true/false)

---

## How to Customize Parameters

### In the Workflow Editor:

1. Click on any node in the canvas
2. The Properties Panel will appear on the right side
3. Scroll to the "Parameters" section
4. Edit the JSON object with your custom values
5. Click Save

### Example: Modifying Code Analysis Parameters

```json
{
  "focus": "security",
  "checkFor": ["sql-injection", "xss", "csrf"],
  "severity": "critical",
  "maxIssues": 5
}
```

### Example: Customizing Content Creation

```json
{
  "contentType": "tutorial",
  "targetAudience": "beginners",
  "sections": 7,
  "detailLevel": "detailed",
  "wordCount": "2500-3000"
}
```

---

## Tips for Customization

1. **Start with templates**: All templates have sensible defaults
2. **Modify as needed**: Edit parameters to match your workflow requirements
3. **Test first**: Run workflows with sample data before production use
4. **Save your changes**: After editing, save the workflow to persist changes
5. **Reuse modified versions**: Export customized workflows to use again

---

## Common Customization Scenarios

### Faster Code Reviews

```json
{
  "severity": "high",
  "maxIssues": 5,
  "checkFor": ["security", "performance"]
}
```

### Academic Research

```json
{
  "depth": "comprehensive",
  "sources": "academic",
  "researchHours": 8,
  "citationFormat": "APA"
}
```

### Quick Blog Posts

```json
{
  "contentType": "blog",
  "sections": 5,
  "wordCount": "800-1000",
  "tone": "friendly"
}
```

### Strict Quality Gate

```json
{
  "threshold": 0.9,
  "metrics": ["quality", "performance", "security"],
  "detailed": true
}
```

---

## Next Steps

1. **Load a template** from the Workflows page
2. **Click on nodes** to customize parameters
3. **Configure agents** by selecting from available agents
4. **Set up connections** between workflow steps
5. **Test with sample data** before running
6. **Save and execute** your workflow
7. **Export** for reuse or sharing
