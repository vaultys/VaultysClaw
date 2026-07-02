"use client";

import { useRole } from "@/hooks/useRole";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  AlertCircle,
  Trash2,
  QrCode,
  Send,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useToolbar, type ToolbarAction } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  usersClient,
  serverClient,
  userAuthClient,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { UnclaimedUserDetail } from "@/lib/contracts";
import {
  UserTabBar,
  type TabItem,
} from "@/components/users/detail/UserTabBar";
import { UnclaimedOverviewTab } from "@/components/users/detail/UnclaimedOverviewTab";
import { UnclaimedWorkspacesTab } from "@/components/users/detail/UnclaimedWorkspacesTab";
import { QrClaimModal, type QrPhase } from "@/components/users/QrClaimModal";

type TabId = "overview" | "workspaces";

export default function UnregisteredUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [user, setUser] = useState<UnclaimedUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [smtpAvailable, setSmtpAvailable] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [qrModal, setQrModal] = useState<{
    qrUrl: string;
    token: string;
    phase: QrPhase;
  } | null>(null);

  // Tracks the in-flight QR poll so it can be cancelled when the modal closes
  // or the page unmounts — otherwise /api/user/listen keeps polling forever.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  const cancelPoll = useCallback(() => {
    if (pollRef.current) pollRef.current.cancelled = true;
    pollRef.current = null;
  }, []);
  useEffect(() => cancelPoll, [cancelPoll]);

  const { isAdmin } = useRole();

  const load = useCallback(async () => {
    try {
      setUser(unwrap(await usersClient.getUnclaimed({ params: { id } })));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.push("/");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    serverClient
      .getSmtp()
      .then((res) =>
        setSmtpAvailable(
          res.status === 200 && Boolean((res.body as { host?: string })?.host)
        )
      )
      .catch(() => {});
  }, []);

  const generateQr = useCallback(
    async (sendByEmail: boolean) => {
      if (!user) return;
      setSendingQr(true);
      try {
        if (sendByEmail) {
          try {
            unwrap(
              await usersClient.inviteEmail({
                body: {
                  email: user.email ?? "",
                  name: user.name ?? "",
                  role: user.role,
                },
              })
            );
            alert(`Invitation sent to ${user.email}`);
          } catch (err) {
            alert(
              err instanceof ApiError
                ? err.message
                : "Failed to send invitation"
            );
          }
          return;
        }

        const [inviteRes, settingsRes] = await Promise.all([
          usersClient.invite({ query: { userId: user.id } }),
          serverClient.getSettings(),
        ]);
        const data = unwrap(inviteRes);
        const settings = unwrap(settingsRes);
        const base = settings.walletUrl || "https://wallet.vaultys.net";
        const didParam = data.serverDid
          ? `&did=${encodeURIComponent(data.serverDid)}`
          : "";
        const qrUrl = `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;

        setQrModal({ qrUrl, token: data.token, phase: "showing" });

        // Start a fresh poll, cancelling any previous one.
        cancelPoll();
        const poll = { cancelled: false };
        pollRef.current = poll;

        for (let i = 0; i < 180; i++) {
          await new Promise((res) => setTimeout(res, 1500));
          if (poll.cancelled) return;
          const { status } = unwrap(
            await userAuthClient.listen({ params: { token: data.token } })
          );
          if (poll.cancelled) return;
          if (status === 2) {
            setQrModal((m) => (m ? { ...m, phase: "success" } : null));
            // Once claimed the user gains a DID and this page no longer applies.
            setTimeout(() => router.push("/admin/users"), 1500);
            return;
          }
          if (status === -2) {
            setQrModal((m) => (m ? { ...m, phase: "failure" } : null));
            return;
          }
        }
      } finally {
        setSendingQr(false);
      }
    },
    [user, router, cancelPoll]
  );

  const handleRemove = useCallback(async () => {
    if (!user) return;
    if (
      !confirm(
        `Remove ${user.name ?? user.email ?? "this user"}? This cannot be undone.`
      )
    )
      return;
    setRemoving(true);
    try {
      unwrap(await usersClient.removeUnclaimed({ params: { id } }));
      router.push("/admin/users");
    } catch {
      setRemoving(false);
    }
  }, [user, id, router]);

  useBreadcrumbs(
    [{ label: "Users", href: "/admin/users" }, { label: user?.name ?? "Unclaimed user" }],
    [user?.name]
  );

  const toolbarActions: ToolbarAction[] = [];
  if (user) {
    toolbarActions.push({
      kind: "badge",
      id: "unclaimed",
      label: "Unclaimed",
      tone: "warning",
    });
    if (user.entraId) {
      toolbarActions.push({
        kind: "badge",
        id: "entra",
        label: "Entra ID",
        tone: "neutral",
      });
    }
    toolbarActions.push({
      kind: "button",
      id: "qr",
      label: "Show QR",
      variant: "primary",
      icon: <QrCode size={14} />,
      onClick: () => generateQr(false),
      disabled: sendingQr,
    });
    if (user.email && smtpAvailable) {
      toolbarActions.push({
        kind: "button",
        id: "email",
        label: "Send by email",
        variant: "default",
        icon: <Send size={14} />,
        onClick: () => generateQr(true),
        disabled: sendingQr,
      });
    }
    if (isAdmin) {
      toolbarActions.push({
        kind: "button",
        id: "remove",
        label: "Remove",
        variant: "danger",
        icon: <Trash2 size={14} />,
        onClick: handleRemove,
        disabled: removing,
      });
    }
  }

  useToolbar(
    {
      title: user?.name ?? "Unnamed user",
      description: user
        ? (user.email ?? "Provisioned — no VaultysID yet")
        : id,
      actions: toolbarActions,
    },
    [user, isAdmin, smtpAvailable, sendingQr, removing, generateQr, handleRemove, id]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground font-medium">
            User not found or already claimed
          </p>
          <p className="text-foreground-500 text-sm mt-1">
            They may have claimed their account or been removed.
          </p>
          <button
            onClick={() => router.push("/admin/users")}
            className="mt-4 text-primary-500 text-sm hover:underline"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  const tabs: TabItem<TabId>[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "workspaces", label: "Workspaces", icon: <Users size={15} /> },
  ];

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-background-100">
        <UserTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && (
            <UnclaimedOverviewTab
              user={user}
              isAdmin={isAdmin}
              onUpdated={(patch) => setUser((u) => (u ? { ...u, ...patch } : u))}
            />
          )}
          {activeTab === "workspaces" && <UnclaimedWorkspacesTab workspaces={user.workspaces} />}
        </div>
      </div>

      {qrModal && (
        <QrClaimModal
          subtitle={user.name ?? user.email ?? "Unknown user"}
          qrUrl={qrModal.qrUrl}
          phase={qrModal.phase}
          onClose={() => {
            cancelPoll();
            setQrModal(null);
          }}
          onRetry={() => {
            setQrModal(null);
            generateQr(false);
          }}
        />
      )}
    </div>
  );
}
