-- Politiques plateforme en mode démonstration.
-- En production : restreindre SELECT/UPDATE aux administrateurs plateforme authentifiés.
-- Ici, la console propriétaire de démo utilise la clé publique.
create policy demo_select_signup on signup_requests for select using (true);
create policy demo_update_signup on signup_requests for update using (true) with check (true);
create policy demo_insert_promo on promo_codes for insert with check (true);
create policy demo_update_promo on promo_codes for update using (true) with check (true);
create policy demo_delete_promo on promo_codes for delete using (true);;
