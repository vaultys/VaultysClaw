import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import path from "path";

// Load .env.local first (Next.js convention), then .env as fallback
config({ path: path.resolve(__dirname, ".env.local") });
config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
