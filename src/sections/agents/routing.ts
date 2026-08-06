/** 
 * Routage IA : Regex pondérées pour attribuer une conversation à l'agent pertinent.
 */
export function routeAgentForText(text: string): string {
  const t = text.toLowerCase();
  
  // Superviseur : détection de frustration ou réclamations (Priorité haute)
  if (/\b(honteux|arnaque|plainte|avocat|remboursement|inacceptable|honte|mauvais)\b/i.test(t)) return "ag_supervisor";
  
  // Technique : diagnostics, pannes, SAV matériel
  if (/\b(panne|casse|defaut|garantie|sav|reparer|marche pas|probleme technique)\b/i.test(t)) return "ag_tech";
  
  // Rendez-vous : créneaux, planning, réservations
  if (/\b(rdv|rendez-vous|reserver|creneau|disponible le|planning|visite)\b/i.test(t)) return "ag_rdv";
  
  // Commercial : prix, catalogue, produits, offres
  if (/\b(prix|tarif|combien|commander|achat|offre|promo|catalogue|produit|boutique)\b/i.test(t)) return "ag_sales";
  
  // Analyste : chiffres, tendances, stats
  if (/\b(chiffre|stat|tendance|performance|rapport|activite|bilan)\b/i.test(t)) return "ag_analyst";

  // Support : par défaut (FAQ, infos générales)
  return "ag_support";
}
