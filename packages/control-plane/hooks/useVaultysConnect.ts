"use client";

import { BrowserChannel } from "@vaultys/channel-browser";
import { VaultysId, crypto } from "@vaultys/id";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  SERVER_URL,
  generateBrowserId,
  getStoredBrowserId,
  runBrowserDirectConnect,
  srp,
  type BrowserIdData,
  type WalletSecurityType,
} from "@/lib/browser-connect";
import {
  serverClient,
  userAuthClient,
  userStatusClient,
  unwrap,
} from "@/lib/api/ts-rest/client";

const Buffer = crypto.Buffer;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UIStep =
  | "loading"
  | "claim-ownership" // no users exist → show ownership claim screen
  | "first-connect" // users exist → normal login landing
  | "select-security" // choose browser-wallet security type (SOFTWARE/PASSKEY/HARDWARE)
  | "bastion-connect" // browser-device SRP in progress
  | "qr-connect" // QR code or deep-link shown, polling server
  | "p2p-connect" // P2P relay mode (user opts in)
  | "done";

export type BastionPhase =
  | "connect"
  | "waiting"
  | "authenticate"
  | "success"
  | "failure";
export type UserConnectionPhase = "connect" | "waiting" | "success" | "failure";

// Re-exported from lib/browser-connect for backwards compatibility — these used
// to be defined here and are imported across the signin components.
export type { WalletSecurityType, BrowserIdData };

export interface UserConnectInfo {
  key: string;
  connectionToken: string;
  url: string;
}

export interface UseVaultysConnectResult {
  uiStep: UIStep;
  bastionPhase?: BastionPhase;
  userConnectionPhase?: UserConnectionPhase;
  userConnectInfo?: UserConnectInfo;
  p2pUrl?: string; // full https://wallet.vaultys.net/#vaultys://peerjs?... URL for QR display
  devLogin: boolean; // whether the "connect without app" dev option is enabled
  devConnecting: boolean; // browser-direct SRP in progress
  startConnectionFlow: () => void;
  selectSecurityType: (type: WalletSecurityType) => void;
  startP2PMode: () => void;
  connectWithoutApp: (securityType: WalletSecurityType) => void;
  retry: () => void;
  hasUsers: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectionToken(key: string): string {
  return crypto
    .hash("sha256", Buffer.from(`connecting-${key}-vaultys`))
    .toString("hex");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultysConnect(): UseVaultysConnectResult {
  const [uiStep, setUIStep] = useState<UIStep>("loading");
  const [hasUsers, setHasUsers] = useState(false);
  const [serverDid, setServerDid] = useState<string | null>(null);
  const [walletUrl, setWalletUrl] = useState("https://wallet.vaultys.net");
  const [browserVid, setBrowserVid] = useState<BrowserIdData | null>(null);
  const [bastionPhase, setBastionPhase] = useState<BastionPhase>();
  const [userConnectionPhase, setUserConnectionPhase] =
    useState<UserConnectionPhase>();
  const [userConnectInfo, setUserConnectInfo] = useState<UserConnectInfo>();
  const [p2pUrl, setP2PUrl] = useState<string>();
  const [devLogin, setDevLogin] = useState(false);
  const [devConnecting, setDevConnecting] = useState(false);

  // Load initial state
  useEffect(() => {
    (async () => {
      const [statusRes, settingsRes] = await Promise.all([
        userStatusClient.status(),
        serverClient.getSettings(),
      ]);
      const { hasUsers: hu, serverDid: sd } = unwrap(statusRes);
      const { walletUrl: wu, devLogin: dl } = unwrap(settingsRes);
      setHasUsers(hu);
      setServerDid(sd);
      if (wu) setWalletUrl(wu);
      setDevLogin(!!dl);
      const storedVid = getStoredBrowserId();
      setBrowserVid(storedVid);
      setUIStep(hu ? "first-connect" : "claim-ownership");
    })();
  }, []);

  const waitForUser = useCallback(async (token: string): Promise<boolean> => {
    for (let i = 0; i < 180; i++) {
      const { status } = unwrap(
        await userAuthClient.listen({ params: { token } })
      );
      if (status === 2) return true;
      if (status === -2) return false;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }, []);

  const waitForBastion = useCallback(
    async (token: string): Promise<{ browserDid: string } | null> => {
      for (let i = 0; i < 180; i++) {
        const result = unwrap(
          await userAuthClient.bastionListen({ params: { token } })
        );
        if (result.status === 2 && result.browserDid)
          return { browserDid: result.browserDid };
        if (result.status === -2) return null;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return null;
    },
    []
  );

  const startQRConnection = useCallback(async () => {
    setUserConnectionPhase("connect");
    setUIStep("qr-connect");

    const { key, token } = unwrap(
      await userAuthClient.connect({ query: {} })
    );

    const isPhone = /iPhone|Android/i.test(navigator.userAgent);
    const vaultysUrl = `vaultys://register?url=${encodeURIComponent(SERVER_URL + "/api/user/request")}&key=${key}${isPhone ? "&phone=true" : ""}`;
    const browserUrl = `${walletUrl}#${encodeURIComponent(vaultysUrl)}`;

    setUserConnectInfo({ key, connectionToken: token, url: browserUrl });
    setUserConnectionPhase("waiting");

    const ok = await waitForUser(token);
    if (ok) {
      setUserConnectionPhase("success");
      // Sign in via next-auth credentials
      const res = await signIn("credentials", { token: key, redirect: false });
      if (res?.ok) {
        setUIStep("done");
        window.location.href = "/";
      }
    } else {
      setUserConnectionPhase("failure");
    }
  }, [waitForUser, walletUrl]);

  const startP2PMode = useCallback(async () => {
    setUIStep("p2p-connect");
    setUserConnectionPhase("connect");

    // Server opens the PeerJS channel, runs the Challenger protocol with the
    // wallet, and updates the cert in the DB. The browser just shows the QR.
    const {
      connectionString,
      token,
      key,
      serverDid: sd,
    } = unwrap(await userAuthClient.p2pConnect());

    const did = sd ?? serverDid;
    const didParam = did ? `&did=${encodeURIComponent(did)}` : "";
    const fullP2PUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;
    setP2PUrl(fullP2PUrl);
    setUserConnectionPhase("waiting");

    const ok = await waitForUser(token);
    if (ok) {
      setUserConnectionPhase("success");
      const signInRes = await signIn("credentials", {
        token: key,
        redirect: false,
      });
      if (signInRes?.ok) {
        setUIStep("done");
        window.location.href = "/";
      }
    } else {
      setUserConnectionPhase("failure");
    }
  }, [waitForUser, serverDid, walletUrl]);

  const performBastionConnect = useCallback(
    async (vid: BrowserIdData) => {
      setBastionPhase("connect");
      setUIStep("bastion-connect");

      const bastionRes = await userAuthClient.bastionConnect({
        query: { vid: vid.vid },
      });
      if (bastionRes.status !== 200) {
        setBastionPhase("failure");
        return;
      }
      const { key: encryptedKey } = bastionRes.body;

      setBastionPhase("waiting");

      const vaultysId = VaultysId.fromSecret(vid.secret, "base64").toVersion(1);
      const rawKey = (await vaultysId.decrypt(
        encryptedKey
      )) as unknown as string;
      const token = connectionToken(rawKey);

      setBastionPhase("authenticate");

      // Perform SRP auth in background
      const channel = new BrowserChannel(
        `${SERVER_URL}/api/user/request`,
        rawKey
      );
      try {
        await srp(channel, vaultysId);
      } catch {
        // SRP errors are surfaced via the poll below
      }

      const bastionResult = await waitForBastion(token);
      if (!bastionResult) {
        setBastionPhase("failure");
        return;
      }
      setBastionPhase("success");

      // Now start the user QR/connection flow
      setTimeout(() => startQRConnection(), 300);
    },
    [waitForBastion, startQRConnection]
  );

  const startConnectionFlow = useCallback(() => {
    if (browserVid) {
      performBastionConnect(browserVid);
    } else {
      setUIStep("select-security");
    }
  }, [browserVid, performBastionConnect]);

  const selectSecurityType = useCallback(
    async (type: WalletSecurityType) => {
      const vid = await generateBrowserId(type);
      setBrowserVid(vid);
      performBastionConnect(vid);
    },
    [performBastionConnect]
  );

  // Dev login — the browser performs the user SRP itself with a second stored
  // identity, instead of showing a QR for the mobile VaultysID app. The cert
  // `key` was already obtained at the qr-connect step (userConnectInfo.key), and
  // startQRConnection's waitForUser poll is still running, so it will pick up the
  // completed certificate and finish the sign-in.
  const connectWithoutApp = useCallback(
    async (securityType: WalletSecurityType) => {
      const key = userConnectInfo?.key;
      if (!key) return;
      setDevConnecting(true);
      try {
        await runBrowserDirectConnect({
          key,
          service: hasUsers ? "auth" : "register",
          securityType,
        });
      } catch {
        // SRP errors surface through the running waitForUser poll → failure phase.
      } finally {
        setDevConnecting(false);
      }
    },
    [userConnectInfo, hasUsers]
  );

  const retry = useCallback(() => {
    setUserConnectionPhase(undefined);
    setBastionPhase(undefined);
    setUserConnectInfo(undefined);
    setP2PUrl(undefined);
    setUIStep(hasUsers ? "first-connect" : "claim-ownership");
  }, [hasUsers]);

  return {
    uiStep,
    bastionPhase,
    userConnectionPhase,
    userConnectInfo,
    p2pUrl,
    devLogin,
    devConnecting,
    startConnectionFlow,
    selectSecurityType,
    startP2PMode,
    connectWithoutApp,
    retry,
    hasUsers,
  };
}
