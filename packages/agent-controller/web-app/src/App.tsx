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
        if (d?.did) { setDid(d.did); setAuthState("authenticated"); }
        else setAuthState("unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="w-7 h-7 border-2 border-[#30363d] border-t-[#79c0ff] rounded-full animate-spin" />
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
