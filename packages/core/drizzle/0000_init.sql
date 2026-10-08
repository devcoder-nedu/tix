CREATE TABLE `insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`sprint_id` integer,
	`model` text NOT NULL,
	`input_hash` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "insight_kind" CHECK("insights"."kind" IN ('sprint_review', 'check_in', 'planning_hint', 'pattern_report'))
);
--> statement-breakpoint
CREATE INDEX `insights_sprint` ON `insights` (`sprint_id`,`kind`);--> statement-breakpoint
CREATE TABLE `issue_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` integer NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`actor` text DEFAULT 'me' NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_kind" CHECK("issue_events"."kind" IN ('created', 'status', 'sprint', 'points', 'space', 'field'))
);
--> statement-breakpoint
CREATE INDEX `issue_events_issue` ON `issue_events` (`issue_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`space_id` integer NOT NULL,
	`type` text NOT NULL,
	`parent_id` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`acceptance_criteria` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`points` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`rank` text NOT NULL,
	`sprint_id` integer,
	`created_by` text DEFAULT 'me' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	`deleted_at` text,
	`previous_keys` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "issue_type" CHECK("issues"."type" IN ('epic', 'story', 'task', 'bug', 'spike', 'subtask')),
	CONSTRAINT "issue_status" CHECK("issues"."status" IN ('todo', 'in_progress', 'in_review', 'done')),
	CONSTRAINT "issue_priority" CHECK("issues"."priority" IN ('low', 'medium', 'high')),
	CONSTRAINT "issue_created_by" CHECK("issues"."created_by" IN ('me', 'claude')),
	CONSTRAINT "issue_points" CHECK("issues"."points" IS NULL OR "issues"."points" IN (1, 2, 3, 5, 8, 13)),
	CONSTRAINT "issue_points_type" CHECK("issues"."points" IS NULL OR "issues"."type" NOT IN ('epic', 'subtask')),
	CONSTRAINT "issue_epic_parent" CHECK("issues"."type" <> 'epic' OR "issues"."parent_id" IS NULL),
	CONSTRAINT "issue_subtask_parent" CHECK("issues"."type" <> 'subtask' OR "issues"."parent_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_key_unique` ON `issues` (`key`);--> statement-breakpoint
CREATE INDEX `issues_space` ON `issues` (`space_id`);--> statement-breakpoint
CREATE INDEX `issues_sprint` ON `issues` (`sprint_id`);--> statement-breakpoint
CREATE INDEX `issues_parent` ON `issues` (`parent_id`);--> statement-breakpoint
CREATE INDEX `issues_rank` ON `issues` (`rank`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_key_unique` ON `spaces` (`key`);--> statement-breakpoint
CREATE TABLE `sprint_issues` (
	`sprint_id` integer NOT NULL,
	`issue_id` integer NOT NULL,
	`points_at_start` integer,
	`outcome` text,
	`moved_to` integer,
	PRIMARY KEY(`sprint_id`, `issue_id`),
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moved_to`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sprint_issue_outcome" CHECK("sprint_issues"."outcome" IS NULL OR "sprint_issues"."outcome" IN ('done', 'carried_over', 'returned')),
	CONSTRAINT "sprint_issue_moved" CHECK("sprint_issues"."moved_to" IS NULL OR "sprint_issues"."outcome" = 'carried_over')
);
--> statement-breakpoint
CREATE INDEX `sprint_issues_issue` ON `sprint_issues` (`issue_id`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`length_weeks` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`capacity` integer NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`completed_at` text,
	CONSTRAINT "sprint_length" CHECK("sprints"."length_weeks" IN (1, 2)),
	CONSTRAINT "sprint_state" CHECK("sprints"."state" IN ('planned', 'active', 'completed')),
	CONSTRAINT "sprint_capacity" CHECK("sprints"."capacity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sprints_number_unique` ON `sprints` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_sprint` ON `sprints` (`state`) WHERE "sprints"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `one_planned_sprint` ON `sprints` (`state`) WHERE "sprints"."state" = 'planned';