import { describe, it, expect } from "vitest";
import {
  fmtUptime,
  timeAgo,
  formatTimeOnly,
  formatDate,
  fmtDuration,
  getInitials,
  shortDid,
  formatBytes,
  formatNumber,
} from "../packages/shared/src/utils/formatting";

describe("Formatting Utilities", () => {
  describe("fmtUptime", () => {
    it("should format seconds only", () => {
      expect(fmtUptime(30)).toBe("30.0s");
    });

    it("should format minutes", () => {
      expect(fmtUptime(130)).toBe("2.2m");
    });

    it("should format hours", () => {
      expect(fmtUptime(3670)).toBe("1.0h");
    });

    it("should handle zero", () => {
      expect(fmtUptime(0)).toBe("0ms");
    });
  });

  describe("timeAgo", () => {
    it("should show 'just now' for recent timestamps", () => {
      const now = new Date().toISOString();
      expect(timeAgo(now)).toBe("just now");
    });

    it("should show minutes ago", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(timeAgo(fiveMinutesAgo)).toBe("5m ago");
    });

    it("should show hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(twoHoursAgo)).toBe("2h ago");
    });

    it("should show days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(threeDaysAgo)).toBe("3d ago");
    });

    it("should return — for null", () => {
      expect(timeAgo(null)).toBe("—");
    });
  });

  describe("formatTimeOnly", () => {
    it("should extract HH:MM:SS from ISO string", () => {
      expect(formatTimeOnly("2026-05-28T14:30:45Z")).toBe("14:30:45");
    });
  });

  describe("formatDate", () => {
    it("should format date to locale string", () => {
      const result = formatDate("2026-05-28T14:30:45Z");
      // Just verify it's a formatted date (varies by locale)
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(/\d+/.test(result)).toBe(true); // Contains at least one digit
    });
  });

  describe("fmtDuration", () => {
    it("should format milliseconds", () => {
      expect(fmtDuration(500)).toBe("500ms");
    });

    it("should format seconds", () => {
      expect(fmtDuration(2500)).toBe("2.5s");
    });

    it("should format minutes", () => {
      expect(fmtDuration(90000)).toBe("1.5m");
    });

    it("should format hours", () => {
      expect(fmtDuration(3600000)).toBe("1.0h");
    });
  });

  describe("getInitials", () => {
    it("should extract initials from name", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("should handle single names", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("should handle multiple words", () => {
      expect(getInitials("John Michael Doe")).toBe("JM");
    });

    it("should handle empty string", () => {
      expect(getInitials("")).toBe("?");
    });

    it("should be uppercase", () => {
      expect(getInitials("john doe")).toBe("JD");
    });
  });

  describe("shortDid", () => {
    it("should truncate long DID parts", () => {
      const longDid = "did:vaultys:abcdefghijklmnopqrst";
      const result = shortDid(longDid);
      expect(result).toContain("…");
      expect(result).toContain("qrst");
    });

    it("should keep short DID parts as-is", () => {
      const shortDidInput = "did:vaultys:abc";
      expect(shortDid(shortDidInput)).toBe("abc");
    });

    it("should handle undefined", () => {
      expect(shortDid(undefined)).toBe("Unknown");
    });

    it("should preserve the last part of DID", () => {
      const result = shortDid("did:vaultys:0123456789abcdef");
      expect(result).toContain("abcdef");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes", () => {
      expect(formatBytes(100)).toBe("100.0B");
    });

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.0KB");
    });

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.0MB");
    });

    it("should handle zero", () => {
      expect(formatBytes(0)).toBe("0B");
    });
  });

  describe("formatNumber", () => {
    it("should add thousands separator", () => {
      const result = formatNumber(1000);
      expect(result).toContain("1");
      expect(result.length).toBeGreaterThan(4); // has separator
    });

    it("should handle small numbers", () => {
      expect(formatNumber(100)).toBe("100");
    });
  });
});
