/**
 * SMTP email service using nodemailer.
 * Configuration is stored in the settings table.
 */

import { getSetting, setSetting } from "./db";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = getSetting("smtp_host");
  const port = getSetting("smtp_port");
  const from = getSetting("smtp_from");
  if (!host || !port || !from) return null;
  return {
    host,
    port: parseInt(port, 10),
    secure: getSetting("smtp_secure") === "true",
    user: getSetting("smtp_user") ?? "",
    password: getSetting("smtp_password") ?? "",
    from,
  };
}

export function saveSmtpConfig(config: SmtpConfig): void {
  setSetting("smtp_host", config.host);
  setSetting("smtp_port", String(config.port));
  setSetting("smtp_secure", config.secure ? "true" : "false");
  setSetting("smtp_user", config.user);
  setSetting("smtp_password", config.password);
  setSetting("smtp_from", config.from);
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const config = getSmtpConfig();
  if (!config) throw new Error("SMTP not configured");

  // Dynamically import nodemailer to avoid bundling issues
  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

export async function testSmtpConnection(config: SmtpConfig): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
  await transporter.verify();
}
