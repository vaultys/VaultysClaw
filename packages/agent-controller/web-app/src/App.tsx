import { useState, useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

type AuthState = "loading" | "unauthenticated" | "authenticated";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [did, setDid] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.ok) return r.json() as Promise<{ did: string }>;
        return null;
      })
      .then((d) => {
        if (d?.did) {
          setDid(d.did);
          setAuthState("authenticated");
        } else setAuthState("unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex items-center justify-center h-full bg-canvas">
        <div className="w-7 h-7 border-2 border-border border-t-info rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <Login
        onLogin={(newDid) => {
          setDid(newDid);
          setAuthState("authenticated");
        }}
      />
    );
  }

  return (
    <Dashboard
      did={did}
      onLogout={() => {
        setDid("");
        setAuthState("unauthenticated");
      }}
    />
  );
}
