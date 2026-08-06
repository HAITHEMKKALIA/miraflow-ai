export const SAVED_REPLIES = [
  { id: "rep_1", title: "Livraison", body: "Bonjour {{prenom}}, la livraison vers {{ville}} est disponible aujourd'hui." },
  { id: "rep_2", title: "Produit", body: "Bonjour {{prenom}}, le produit {{produit}} est bien disponible." },
  { id: "rep_3", title: "Suivi", body: "Bonjour {{prenom}}, je vérifie votre demande et je reviens vers vous rapidement." },
];

export function fillReplyVars(template: string, vars: Record<string, string | undefined>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? "");
}

export function splitVars(template: string) {
  return template.split(/(\{\{[^}]+\}\})/g).filter(Boolean).map((text) => ({
    text,
    isVar: /^\{\{[^}]+\}\}$/.test(text),
  }));
}
