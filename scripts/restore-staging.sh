#!/usr/bin/env sh
# Fills STAGING with a copy of production (made by scripts/backup.sh), then removes what must not live on a
# test site: all members and their e-mail/payment history (real people's data), newsletter sending
# (Mailgun keys), Ghost's own Stripe keys. donate_api_url is pointed at staging; the site becomes private.
#
# Run on the STAGING server, in the repo folder:
#     scripts/restore-staging.sh vf-<date>-db.sql.gz vf-<date>-content.tar.gz
# Staff accounts (Ghost Admin logins) and integrations come over unchanged.
set -eu

DB_DUMP="${1:?usage: restore-staging.sh <db.sql.gz> <content.tar.gz>}"
CONTENT="${2:?usage: restore-staging.sh <db.sql.gz> <content.tar.gz>}"
DC="${DC:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"   # override only for testing

GHOST_URL="${GHOST_URL:-$(sed -n 's/^GHOST_URL=//p' .env | tail -1 | tr -d '"' | sed 's:/*$::')}"
case "$GHOST_URL" in
    ""|https://vilagitanifogok.hu|https://www.vilagitanifogok.hu)
        echo "✗ GHOST_URL in .env is '$GHOST_URL' – this script only runs on staging. Nothing changed."; exit 1 ;;
esac
echo "Restoring production data into $GHOST_URL"
printf "This REPLACES the staging database and files. Continue? [y/N] "; read -r ok; [ "$ok" = "y" ] || exit 1

sql() { $DC exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 ghost'; }

echo "→ stopping Ghost"
$DC stop ghost

echo "→ importing database"
gunzip -c "$DB_DUMP" | sql

echo "→ removing members and personal data"
sql <<'SQL'
SET FOREIGN_KEY_CHECKS = 0;
-- every members_* table except the field definitions
SET @t = (SELECT GROUP_CONCAT(table_name) FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name LIKE 'members%'   -- views skipped
          AND table_name NOT IN ('members_metafields', 'members_metafield_bindings'));
SET @i = 0;
-- MySQL can't TRUNCATE a list, so loop over it
DROP PROCEDURE IF EXISTS vf_wipe;
DELIMITER //
CREATE PROCEDURE vf_wipe(IN list TEXT)
BEGIN
  WHILE list IS NOT NULL AND list <> '' DO
    SET @name = SUBSTRING_INDEX(list, ',', 1);
    SET @s = CONCAT('TRUNCATE TABLE `', @name, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    SET list = IF(LOCATE(',', list) > 0, SUBSTRING(list, LOCATE(',', list) + 1), '');
  END WHILE;
END //
DELIMITER ;
CALL vf_wipe(@t);
CALL vf_wipe('email_recipients,email_recipient_failures,email_spam_complaint_events,automated_email_recipients,comments,comment_likes,comment_reports,donation_payment_events,machine_payment_events,offer_redemptions,subscriptions,suppressions,gifts,gift_deliveries,automation_runs,automation_run_steps,welcome_email_automation_runs,recommendation_click_events,recommendation_subscribe_events,outbox,sessions,tokens,brute');
DROP PROCEDURE vf_wipe;
SET FOREIGN_KEY_CHECKS = 1;

-- no newsletters and no Ghost-side payments from staging
UPDATE settings SET value = NULL WHERE `key` IN ('mailgun_api_key', 'mailgun_domain', 'mailgun_base_url',
    'stripe_secret_key', 'stripe_publishable_key', 'stripe_connect_secret_key', 'stripe_connect_publishable_key',
    'stripe_connect_account_id', 'stripe_connect_display_name', 'stripe_connect_livemode');
SQL

PASS="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 12)"
sql <<SQL
UPDATE settings SET value = 'true' WHERE \`key\` = 'is_private';
UPDATE settings SET value = '$PASS' WHERE \`key\` = 'password';
UPDATE custom_theme_settings SET value = '$GHOST_URL/api/donate/checkout' WHERE \`key\` = 'donate_api_url';
SQL

echo "→ uploaded files"
$DC start ghost
$DC exec -T ghost sh -c 'rm -rf /var/lib/ghost/content/images /var/lib/ghost/content/files /var/lib/ghost/content/media'
$DC exec -T ghost tar xzf - -C /var/lib/ghost/content < "$CONTENT"
$DC exec -T ghost chown -R node:node /var/lib/ghost/content/images /var/lib/ghost/content/files /var/lib/ghost/content/media
$DC restart ghost

echo "✓ staging = copy of production (without members)."
echo "  Private site password (Settings → Access to change it): $PASS"
echo "  Ghost Admin: same staff logins as production."
