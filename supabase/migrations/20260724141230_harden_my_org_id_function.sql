-- Durcissement : la fonction helper n'est appelée que depuis les politiques RLS,
-- elle ne doit pas être exécutable directement via l'API.
revoke execute on function public.my_org_id() from anon, authenticated;;
