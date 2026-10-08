-- Added by hand: a database made before this rule may already hold two spaces
-- with the same name. Keep the oldest name as is and add the key to the others
-- ("French (FREN)"), so the unique index below can be created. Nothing is lost.
UPDATE `spaces` SET `name` = `name` || ' (' || `key` || ')'
WHERE `id` NOT IN (SELECT min(`id`) FROM `spaces` GROUP BY lower(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_name_unique` ON `spaces` (lower("name"));
