import nodemailer from "nodemailer";
import { prisma } from "./prisma";

/**
 * SMTP sender for the notifier. Reads the same settings the control plane stores
 * (via the `settings` key/value table) so email is sent with the SMTP config
 * chosen in the control plane UI. Mirrors `control-plane/lib/smtp.ts`.
 */

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? undefined;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const host = await getSetting("smtp_host");
  const port = await getSetting("smtp_port");
  const from = await getSetting("smtp_from");
  if (!host || !port || !from) return null;
  return {
    host,
    port: parseInt(port, 10),
    secure: (await getSetting("smtp_secure")) === "true",
    user: (await getSetting("smtp_user")) ?? "",
    password: (await getSetting("smtp_password")) ?? "",
    from,
  };
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Send an email. Returns false (without throwing) when SMTP is not configured. */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) return false;

  const transporter = nodemailer.createTransport({
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
  return true;
}
