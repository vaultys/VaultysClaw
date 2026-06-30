import { User, BadgeCheck, Crown, Shield, MapPin } from "lucide-react";
import type { MeProfile } from "@/lib/contracts";
import { SectionHeader, Row } from "./primitives";
import { EditableField } from "./EditableField";

export function ProfileTab({
  profile,
  onPatch,
}: {
  profile: MeProfile | null;
  onPatch: (fields: {
    name?: string;
    email?: string;
    description?: string;
  }) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={User} title="Profile" />
        <div className="p-5 space-y-0">
          <EditableField
            label="Display Name"
            value={profile?.name ?? ""}
            placeholder="Your name"
            maxLength={128}
            onSave={(v) => onPatch({ name: v })}
          />
          <EditableField
            label="Email"
            value={profile?.email ?? ""}
            placeholder="your@email.com"
            maxLength={256}
            onSave={(v) => onPatch({ email: v })}
          />
          <EditableField
            label="Bio"
            value={profile?.description ?? ""}
            placeholder="A short description about yourself"
            textarea
            maxLength={500}
            onSave={(v) => onPatch({ description: v })}
          />
          {profile?.role && profile.role !== "Member" && (
            <Row label="Org Role" value={<span>{profile.role}</span>} />
          )}
          {profile?.locationLabel && (
            <Row
              label="Location"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <MapPin className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {profile.locationLabel}
                </span>
              }
            />
          )}
        </div>
      </section>

      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={BadgeCheck} title="Roles" />
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {profile?.role === "Owner" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-xs font-medium">
                <Crown className="w-3.5 h-3.5" /> Owner
              </span>
            )}
            {profile?.role === "Admin" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-xs font-medium">
                <Shield className="w-3.5 h-3.5" /> Global Admin
              </span>
            )}
            {(!profile?.role || profile.role === "Member") && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background-200 text-foreground-500 border border-neutral-300 rounded-full text-xs font-medium">
                <User className="w-3.5 h-3.5" /> Member
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-400">
            Roles are assigned by administrators. Contact your admin to request
            changes.
          </p>
        </div>
      </section>
    </div>
  );
}
