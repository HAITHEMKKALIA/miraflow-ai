/**
 * RequireOwner — garde d'accès à la console plateforme.
 * Sans session propriétaire valide → redirection vers /admin/login.
 */
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { isOwnerAuthed } from "@/lib/owner";

export default function RequireOwner({ children }: { children: ReactNode }) {
  if (!isOwnerAuthed()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
