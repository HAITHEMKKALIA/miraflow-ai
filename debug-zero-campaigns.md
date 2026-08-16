# Debug Session: zero-campaigns

Status: OPEN

## Symptom
- `tickCampaigns` voit toujours `0` campagnes.

## Hypotheses
- H1: `/campaigns?status=eq.running&select=id,org_id,content,stats,audience` renvoie un tableau vide.
- H2: Les campagnes existent mais seulement dans `running,done,paused,stopped`, donc visibles côté reply tracking mais pas côté tick.
- H3: L’endpoint organisation utilisé pour le diagnostic doit être `organizations` et non `orgs`.
- H4: Les champs `stats` ou `audience` reviennent dans un format inattendu.

## Instrumentation Plan
- Ajouter une route de dump qui exécute exactement les mêmes requêtes Supabase que `tickCampaigns` et `processIncomingMessageForCampainsAndAI`.
- Comparer les longueurs et renvoyer les payloads bruts pour inspection.
