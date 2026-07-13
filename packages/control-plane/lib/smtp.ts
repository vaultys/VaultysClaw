import { SettingsDAO } from "@/db";

/**
 * SMTP email service using nodemailer.
 * Configuration is stored in the settings table.
 */


export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const host = await SettingsDAO.get("smtp_host");
  const port = await SettingsDAO.get("smtp_port");
  const from = await SettingsDAO.get("smtp_from");
  if (host && port && from) {
    return {
      host,
      port: parseInt(port, 10),
      secure: await SettingsDAO.get("smtp_secure") === "true",
      user: await SettingsDAO.get("smtp_user") ?? "",
      password: await SettingsDAO.get("smtp_password") ?? "",
      from,
    };
  }

  // Dev/demo fallback: no SMTP configured in the admin UI yet, but SMTP_HOST
  // is set in the environment (e.g. the smtp4dev catcher in docker-compose).
  const envHost = process.env.SMTP_HOST;
  if (!envHost) return null;
  return {
    host: envHost,
    port: parseInt(process.env.SMTP_PORT ?? "25", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "noreply@vaultysclaw.local",
  };
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  await SettingsDAO.set("smtp_host", config.host);
  await SettingsDAO.set("smtp_port", String(config.port));
  await SettingsDAO.set("smtp_secure", config.secure ? "true" : "false");
  await SettingsDAO.set("smtp_user", config.user);
  await SettingsDAO.set("smtp_password", config.password);
  await SettingsDAO.set("smtp_from", config.from);
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) throw new Error("SMTP not configured");

  // Dynamically import nodemailer to avoid bundling issues
  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.password }
      : undefined,
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
    auth: config.user
      ? { user: config.user, pass: config.password }
      : undefined,
  });
  await transporter.verify();
}
