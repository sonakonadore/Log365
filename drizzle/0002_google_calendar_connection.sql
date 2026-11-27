CREATE TABLE `google_calendar_links` (
	`owner` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`tokens` text NOT NULL,
	`calendar` text
);
--> statement-breakpoint
CREATE TABLE `google_calendar_states` (
	`owner` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
