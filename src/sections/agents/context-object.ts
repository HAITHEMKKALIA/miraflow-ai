import { createContext } from "react";
import type { AgentsPageCtx } from "./data";

export const Ctx = createContext<AgentsPageCtx | null>(null);
