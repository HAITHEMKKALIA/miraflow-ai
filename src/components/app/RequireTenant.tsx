import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { isTenantAuthed } from "@/lib/tenant";

export default function RequireTenant({ children }: { children: ReactNode }) {
  if (!isTenantAuthed()) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
