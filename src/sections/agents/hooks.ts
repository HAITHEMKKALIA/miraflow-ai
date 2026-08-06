import { useContext } from "react";
import { Ctx } from "./context-object";
import type { AgentsPageCtx } from "./data";

export function useAgentsPage(): AgentsPageCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgentsPage doit être utilisé sous <AgentsProvider>");
  return ctx;
}
