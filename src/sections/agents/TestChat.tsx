/**
 * S5 — Chat de test IA (panneau central). Colonne gauche : sélecteur d'agent
 * (orbe radio), seuil, toggles sources / mode suggestion, persona simulée.
 * Zone de chat : indicateur « l'agent réfléchit… » contextuel, frappe
 * progressive 22 car/s, badge confiance (anneau animé), sources cliquables
 * (popover avec extrait + version), bandeau amber si confiance < seuil,
 * feedback 👍/👎, « Transférer à un humain », suggestions rapides renouvelées.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CornerDownLeft, UserRoundCheck, ThumbsDown, ThumbsUp, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useAgents, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import {
  AGENT_META, COLOR_STYLES, EXTRA_AGENTS, PERSONAS, craftAnswer, pickQuestions, uid,
  type ChatMessage as Msg, type ChatSource, type Persona,
} from "./data";
import { ConfidenceRing, SectionHead, ThresholdSlider, Toggle } from "./controls";
import { useAgentsPage } from "./hooks";
import { EASE } from "./motion";

interface LocalMsg extends Msg {
  shown?: number; // frappe progressive
  typing?: boolean;
}

/* ── Popover de source ─────────────────────────────────────────────────── */
function SourcePopover({ source, onClose }: { source: ChatSource; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="absolute bottom-full z-30 mb-2 w-[300px] rounded-r-md border border-line bg-surface-3 p-3.5 shadow-card start-0"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="label-micro text-pulse">{source.docName} · frag. {source.frag}</p>
        <button type="button" onClick={onClose} aria-label="Fermer la source" className="text-low hover:text-hi">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 text-[12.5px] leading-[19px] text-mid">
        « …<span className="rounded bg-iris/15 px-0.5 text-hi">{source.excerpt}</span>… »
      </p>
    </motion.div>
  );
}

/* ── Bulle de réponse agent ────────────────────────────────────────────── */
function AgentBubble({
  msg,
  agentName,
  threshold,
  suggestionMode,
  showSources,
  onFeedback,
  onTransfer,
}: {
  msg: LocalMsg;
  agentName: string;
  threshold: number;
  suggestionMode: boolean;
  showSources: boolean;
  onFeedback: (id: string, f: "up" | "down") => void;
  onTransfer: (id: string) => void;
}) {
  const [openSrc, setOpenSrc] = useState<number | null>(null);
  const text = msg.text.slice(0, msg.shown ?? msg.text.length);
  const done = !msg.typing;
  const lowConfidence = (msg.confidence ?? 100) < threshold;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-col items-start gap-2"
    >
      {done && lowConfidence && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full items-start gap-2 rounded-r-sm border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] leading-[18px] text-amber"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Confiance {msg.confidence} % &lt; {threshold} % —{" "}
            {suggestionMode
              ? "en mode Suggestion, cette réponse serait soumise à validation."
              : "en mode Autonome, cette réponse serait quand même escaladée à un humain."}
          </span>
        </motion.div>
      )}

      <div className="max-w-[85%] rounded-r-md rounded-es-sm border border-line bg-bubble-in px-3.5 py-2.5">
        <p className="label-micro mb-1 text-low">{agentName}</p>
        <p className="whitespace-pre-wrap text-[13.5px] leading-[21px] text-hi">
          {text}
          {msg.typing && <span className="ms-0.5 inline-block h-4 w-[7px] animate-caret-blink bg-iris align-middle" />}
        </p>
      </div>

      {done && (
        <div className="flex flex-wrap items-center gap-2">
          {msg.confidence !== undefined && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 20 }}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pe-2.5 ps-1"
            >
              <ConfidenceRing value={msg.confidence} />
              <span className="label-micro text-low">confiance</span>
            </motion.span>
          )}

          {showSources &&
            msg.sources?.map((s, i) => (
              <span key={s.frag} className="relative">
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  onClick={() => setOpenSrc(openSrc === i ? null : i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    openSrc === i
                      ? "border-iris/50 bg-iris/10 text-iris"
                      : "border-line bg-surface-2 text-mid hover:text-hi",
                  )}
                >
                  <BookOpen className="size-3" />
                  {s.docName} · {s.frag}
                </motion.button>
                <AnimatePresence>
                  {openSrc === i && <SourcePopover source={s} onClose={() => setOpenSrc(null)} />}
                </AnimatePresence>
              </span>
            ))}

          <span className="flex items-center gap-1">
            {(["up", "down"] as const).map((f) => (
              <motion.button
                key={f}
                type="button"
                whileTap={{ scale: 1.3 }}
                onClick={() => onFeedback(msg.id, f)}
                aria-label={f === "up" ? "Bonne réponse" : "Mauvaise réponse"}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border transition-colors",
                  msg.feedback === f
                    ? f === "up" ? "border-mint/50 bg-mint/10 text-mint" : "border-rose/50 bg-rose/10 text-rose"
                    : "border-line text-low hover:text-mid",
                )}
              >
                {f === "up" ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
              </motion.button>
            ))}
          </span>

          <button
            type="button"
            onClick={() => onTransfer(msg.id)}
            className="flex items-center gap-1.5 rounded-full border border-rose/30 bg-rose/5 px-2.5 py-1 text-[11px] font-medium text-rose transition-colors hover:bg-rose/10"
          >
            <UserRoundCheck className="size-3" />
            Transférer à un humain
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Section ───────────────────────────────────────────────────────────── */
export default function TestChat() {
  const storeAgents = useAgents();
  /* 6 agents du SimEngine + 2 agents locaux (Traduction, Analyse d'images) */
  const agents = useMemo(() => [...storeAgents, ...EXTRA_AGENTS], [storeAgents]);
  const { chatAgentId, setChatAgentId, threshold, setThreshold, docs, chatRef, pushJournal, modes } = useAgentsPage();
  const [persona, setPersona] = useState<Persona>("vip");
  const [showSources, setShowSources] = useState(true);
  const [suggestionMode, setSuggestionMode] = useState(true);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [personaOpen, setPersonaOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const agent = agents.find((a) => a.id === chatAgentId) ?? agents[0];
  const meta = AGENT_META[agent.key || agent.id] || AGENT_META["ag_analyst"];
  const hasDocs = docs.length > 0;

  /* Reset quand l'agent change : message d'accueil */
  useEffect(() => {
    const timeout = setTimeout(() => {
      setMessages([
        { id: uid("m"), from: "agent", text: (AGENT_META[agent.key || agent.id] || AGENT_META["ag_analyst"]).greeting },
      ]);
      setThinking(null);
    }, 0);
    return () => clearTimeout(timeout);
  }, [agent.id]);

  useEffect(() => {
    const currentTimers = timers.current;
    return () => currentTimers.forEach(clearTimeout);
  }, []);

  /* Auto-scroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const questions = useMemo(() => pickQuestions(answerCount), [answerCount]);

  const typeOut = (full: LocalMsg) => {
    const total = full.text.length;
    let shown = 0;
    const tick = () => {
      shown = Math.min(total, shown + 1);
      const current = shown;
      setMessages((ms) => ms.map((m) => (m.id === full.id ? { ...m, shown: current, typing: current < total } : m)));
      if (current < total) timers.current.push(setTimeout(tick, 45)); // ~22 car/s
    };
    timers.current.push(setTimeout(tick, 60));
  };

  const send = (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    setMessages((ms) => [...ms, { id: uid("m"), from: "user", text: q }]);

    /* « l'agent réfléchit… » avec texte contextuel */
    const thinkText = meta.thinking[answerCount % meta.thinking.length];
    setThinking(thinkText);

    timers.current.push(
      setTimeout(() => {
        setThinking(null);
        const answer = craftAnswer(agent.id, q, persona, hasDocs);
        const msg: LocalMsg = { id: uid("m"), from: "agent", text: answer.text, confidence: answer.confidence, sources: answer.sources, shown: 0, typing: true };
        setMessages((ms) => [...ms, msg]);
        setAnswerCount((c) => c + 1);
        typeOut(msg);
        pushJournal({
          agentId: agent.id,
          agentName: agent.name,
          conversation: PERSONAS.find((p) => p.id === persona)?.label ?? "Test",
          action: (modes[agent.id] ?? agent.mode) === "autonomous" ? "Réponse auto" : "Suggestion",
          confidence: answer.confidence,
          decision: "—",
          latencyS: Math.round((0.9 + Math.random() * 1.3) * 10) / 10,
        });
      }, 800),
    );
  };

  const onFeedback = (id: string, f: "up" | "down") => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, feedback: f } : m)));
    toast.success("Merci — feedback transmis à l'entraînement de l'agent.");
  };

  const onTransfer = () => {
    if (messages.some((m) => m.from === "system")) return;
    setMessages((ms) => [
      ...ms,
      { id: uid("m"), from: "system", text: "Conversation transférée à Ines Kacem — un humain prend le relais dans l'Inbox." },
    ]);
    useSim.setState((s) => ({
      notifications: [
        { id: uid("nt"), at: Date.now(), kind: "ai" as const, title: "Transfert à un humain", body: `Le chat de test de l'agent ${agent.name} a été transféré à Ines Kacem.`, read: false },
        ...s.notifications,
      ].slice(0, 30),
    }));
    pushJournal({
      agentId: agent.id,
      agentName: agent.name,
      conversation: "Chat de test",
      action: "Escalade",
      confidence: 0,
      decision: "—",
      latencyS: 0.4,
    });
  };

  return (
    <section ref={chatRef} className="scroll-mt-24">
      <SectionHead title="Chat de test" counter="réponses simulées en local · aucune donnée envoyée" />

      <div className="grid gap-0 overflow-hidden rounded-r-lg border border-line bg-surface-1 lg:grid-cols-[300px_1fr]">
        {/* ── Colonne réglages ── */}
        <aside className="border-b border-line p-5 lg:border-b-0 lg:border-e">
          <p className="label-micro mb-3 text-low">Agent à tester</p>
          <div className="space-y-1.5" role="radiogroup" aria-label="Agent à tester">
            {agents.map((a) => {
              const m = AGENT_META[a.key || a.id] || AGENT_META["ag_analyst"];
              const st = COLOR_STYLES[m.color];
              const selected = a.id === agent.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChatAgentId(a.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-r-sm border px-3 py-2.5 text-start transition-colors",
                    selected ? "border-iris/40 bg-iris/5" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", st.orb)}>
                    <m.icon className={cn("size-3.5", st.text)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-hi">{a.name}</span>
                    <span className="label-micro text-low">{(modes[a.id] ?? a.mode) === "autonomous" ? "Autonome" : "Suggestion"}</span>
                  </span>
                  <span className={cn("size-2 rounded-full border-2", selected ? "border-iris bg-iris" : "border-line-strong")} />
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-4 border-t border-line pt-4">
            <div>
              <p className="label-micro mb-2 text-low">Seuil de confiance</p>
              <ThresholdSlider value={threshold} onChange={setThreshold} id="chat-threshold" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-mid">Afficher les sources</span>
              <Toggle checked={showSources} onChange={setShowSources} label="Afficher les sources" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-mid">Mode suggestion</span>
              <Toggle checked={suggestionMode} onChange={setSuggestionMode} tone="amber" label="Mode suggestion" />
            </div>

            {/* Persona */}
            <div className="relative">
              <p className="label-micro mb-2 text-low">Contexte simulé</p>
              <button
                type="button"
                onClick={() => setPersonaOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi"
              >
                {PERSONAS.find((p) => p.id === persona)?.label}
                <span className="label-micro text-low">persona ▾</span>
              </button>
              <AnimatePresence>
                {personaOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-r-md border border-line bg-surface-3 shadow-card"
                  >
                    {PERSONAS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPersona(p.id);
                          setPersonaOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3.5 py-2.5 text-start transition-colors hover:bg-surface-2",
                          persona === p.id && "bg-surface-2",
                        )}
                      >
                        <span className="block text-[13px] font-medium text-hi">{p.label}</span>
                        <span className="block text-[11.5px] text-low">{p.hint}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* ── Zone de chat ── */}
        <div className="flex min-h-[520px] flex-col">
          {!hasDocs && (
            <div className="flex items-start gap-2 border-b border-amber/30 bg-amber/10 px-4 py-2.5 text-[12px] leading-[18px] text-amber">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Sans base de connaissances, les réponses sont génériques et la confiance plafonne à 60 %.
            </div>
          )}

          <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversation de test" className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((m) =>
              m.from === "user" ? (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                  <div className="bubble-out max-w-[85%] rounded-r-md rounded-ee-sm px-3.5 py-2.5 text-[13.5px] leading-[21px] text-white shadow">
                    {m.text}
                  </div>
                </motion.div>
              ) : m.from === "system" ? (
                <motion.div key={m.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center">
                  <span className="flex items-center gap-2 rounded-full border border-rose/30 bg-rose/10 px-3.5 py-1.5 text-[12px] text-rose">
                    <UserRoundCheck className="size-3.5" />
                    {m.text}
                  </span>
                </motion.div>
              ) : (
                <AgentBubble
                  key={m.id}
                  msg={m}
                  agentName={agent.name}
                  threshold={threshold}
                  suggestionMode={suggestionMode}
                  showSources={showSources}
                  onFeedback={onFeedback}
                  onTransfer={onTransfer}
                />
              ),
            )}

            {thinking && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 rounded-full border border-line bg-bubble-in px-3.5 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full bg-mid"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                <span className="text-[12px] text-low">{thinking}</span>
              </motion.div>
            )}
          </div>

          {/* Suggestions rapides */}
          <div className="flex flex-wrap gap-2 border-t border-line px-5 pt-3">
            {questions.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => send(q)}
                className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-mid transition-colors hover:border-iris/40 hover:text-hi"
              >
                {q}
              </motion.button>
            ))}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 p-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={`Posez une question à l'agent ${agent.name}…`}
              aria-label="Votre message de test"
              className="flex-1 rounded-full border border-line bg-surface-2 px-4 py-2.5 text-[13.5px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() || !!thinking}
              aria-label="Envoyer"
              className="gradient-signature flex size-10 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              <CornerDownLeft className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
