/**
 * Page Agents IA (/app/agents) — design/agents.md.
 * S1 en-tête + stats · S2 orbite des 6 agents · S5 chat de test (panneau
 * central) · S4 base de connaissances RAG · S6 file de validation humaine ·
 * S7 journal IA. Drawer de configuration S3 par-dessus.
 */
import { useAgents } from "@/lib/sim/store";
import { AgentsProvider } from "@/sections/agents/context";
import Header from "@/sections/agents/Header";
import AgentManager from "@/sections/agents/AgentManager";
import OrbitGrid from "@/sections/agents/OrbitGrid";
import ConfigDrawer from "@/sections/agents/ConfigDrawer";
import TestChat from "@/sections/agents/TestChat";
import KnowledgeBase from "@/sections/agents/KnowledgeBase";
import ValidationQueue from "@/sections/agents/ValidationQueue";
import JournalLog from "@/sections/agents/JournalLog";
import CloudGate from "@/components/app/CloudGate";

export default function Agents() {
  const agents = useAgents();
  return (
    <AgentsProvider>
      <CloudGate>
        <div className="mx-auto max-w-[1240px] space-y-10">
        <Header />
        <AgentManager />
        <OrbitGrid agents={agents} />
        <TestChat />
        <KnowledgeBase />
        <ValidationQueue />
        <JournalLog />
      </div>
      </CloudGate>
      <ConfigDrawer />
    </AgentsProvider>
  );
}
