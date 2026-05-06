/**
 * Global setup for UI component tests.
 * Extends vitest matchers with Testing Library's DOM matchers.
 */
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView — stub it
Element.prototype.scrollIntoView = () => { };
