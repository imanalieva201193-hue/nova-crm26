import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Nova CRM" },
      { name: "description", content: "Вход для сотрудников отдела продаж Nova Clinic." },
      { property: "og:title", content: "Вход — Nova CRM" },
      { property: "og:description", content: "Вход для сотрудников отдела продаж Nova Clinic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/funnel", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/funnel", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (r.error) {
      toast.error("Не удалось войти через Google");
      setBusy(false);
      return;
    }
    if (r.redirected) return;
    navigate({ to: "/funnel", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-2xl">
        <div className="font-display text-2xl font-bold text-primary">Nova CRM</div>
        <p className="mt-1 text-sm text-muted-foreground">Отдел продаж · 4 филиала Nova Clinic</p>
        <button
          type="button"
          onClick={signIn}
          disabled={busy}
          className="mt-8 flex h-11 w-full items-center justify-center gap-[10px] rounded-full border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F] disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          Войти через Google
        </button>
        <p className="mt-6 text-xs text-muted-foreground">
          Доступ только для сотрудников из списка. Если доступа нет — обратитесь к РОП.
        </p>
      </div>
    </div>
  );
}
