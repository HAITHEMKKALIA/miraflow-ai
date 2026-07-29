/**
 * AdminLogin — portail de connexion du propriétaire plateforme (/admin/login).
 *
 * Plein écran hors AppShell : orbe Core + aurora, carte glass centrée.
 * Vérifie les identifiants propriétaire (src/lib/owner.ts) ; en succès → /admin.
 * Lien discret « ← Retour au site » vers la landing.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { ownerLogin } from "@/lib/owner";
import { cn } from "@/lib/utils";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    // latence simulée réaliste
    window.setTimeout(() => {
      if (ownerLogin(email, password)) {
        navigate("/admin", { replace: true });
      } else {
        setLoading(false);
        setError("Identifiants incorrects — accès réservé au propriétaire.");
        setShake((s) => s + 1);
      }
    }, 700);
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-base px-5">
      {/* Aurora + grain */}
      <div className="aurora">
        <span />
        <span />
        <span />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px]"
      >
        {/* Carte */}
        <motion.div
          key={shake}
          animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="glass rounded-r-lg p-8 shadow-card"
        >
          {/* Orbe + titre */}
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="size-16 rounded-full gradient-signature opacity-90 blur-[2px] animate-core-breathe" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="size-7 text-white drop-shadow" />
              </div>
            </div>
            <p className="label-micro text-iris">Console plateforme</p>
            <h1 className="mt-1 font-display text-[26px] font-semibold text-hi">
              Espace propriétaire
            </h1>
            <p className="mt-1.5 text-[13px] text-mid">
              Accès réservé — gestion complète de MiraFlow AI
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="label-micro text-low">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@miraflow.ai"
                  className={cn(
                    "w-full rounded-r-sm border bg-surface-1 py-2.5 pe-3 ps-10 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                    error ? "border-rose/60" : "border-line focus:border-iris/60",
                  )}
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="label-micro text-low">Mot de passe</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
                <input
                  type={showPwd ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className={cn(
                    "w-full rounded-r-sm border bg-surface-1 py-2.5 pe-10 ps-10 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                    error ? "border-rose/60" : "border-line focus:border-iris/60",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-low transition-colors hover:text-hi"
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-r-sm border border-rose/25 bg-rose/10 px-3 py-2 text-[12px] text-rose"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="gradient-signature mt-1 flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-iris disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                "Accéder à la console"
              )}
            </button>
          </form>

        </motion.div>

        <div className="mt-5 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-low transition-colors hover:text-hi"
          >
            <ArrowLeft className="size-3.5" />
            Retour au site
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
