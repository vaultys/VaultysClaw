/**
 * Component tests for ChipMultiSelect (the proxy Principals editor's
 * creatable tag/governance-rule picker).
 *
 * Tests:
 *   - renders existing values as chips
 *   - typing a novel value + Enter adds it
 *   - typing a value that exactly matches a suggestion auto-confirms it
 *     (the same path a native datalist click takes, which jsdom can't simulate directly)
 *   - clicking a chip's remove button removes it
 *   - Backspace on an empty input removes the last chip
 *   - a value already selected is not offered again and can't be duplicated
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipMultiSelect } from "../../packages/control-plane/components/proxy/ChipMultiSelect";

function setup(values: string[], suggestions: string[]) {
  const onChange = vi.fn();
  render(
    <ChipMultiSelect
      values={values}
      suggestions={suggestions}
      placeholder="Add a rule…"
      onChange={onChange}
    />
  );
  return { onChange };
}

describe("ChipMultiSelect", () => {
  it("renders existing values as chips", () => {
    setup(["internet_access", "crm_write"], []);
    expect(screen.getByText("internet_access")).toBeInTheDocument();
    expect(screen.getByText("crm_write")).toBeInTheDocument();
  });

  it("adds a novel typed value on Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([], ["internet_access"]);
    const input = screen.getByPlaceholderText("Add a rule…");
    await user.type(input, "custom_rule{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["custom_rule"]);
  });

  it("adds a novel typed value on comma", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([], []);
    const input = screen.getByPlaceholderText("Add a rule…");
    await user.type(input, "wiki_edit,");
    expect(onChange).toHaveBeenLastCalledWith(["wiki_edit"]);
  });

  it("auto-confirms as soon as the typed text exactly matches a suggestion", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([], ["internet_access", "crm_write"]);
    const input = screen.getByPlaceholderText("Add a rule…");
    await user.type(input, "crm_write");
    expect(onChange).toHaveBeenLastCalledWith(["crm_write"]);
  });

  it("removes a chip via its remove button", async () => {
    const user = userEvent.setup();
    const { onChange } = setup(["internet_access", "crm_write"], []);
    await user.click(screen.getByLabelText("Remove crm_write"));
    expect(onChange).toHaveBeenCalledWith(["internet_access"]);
  });

  it("removes the last chip on Backspace when the input is empty", async () => {
    const user = userEvent.setup();
    const { onChange } = setup(["internet_access", "crm_write"], []);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenCalledWith(["internet_access"]);
  });

  it("does not offer or duplicate an already-selected value", async () => {
    const user = userEvent.setup();
    const { onChange } = setup(["internet_access"], ["internet_access"]);
    const input = screen.getByRole("combobox");
    await user.type(input, "internet_access{Enter}");
    // Typing the already-selected value must not produce a second entry.
    expect(onChange).not.toHaveBeenCalledWith(["internet_access", "internet_access"]);
  });
});
