CREATE TABLE `push_deliveries` (
	`device` text NOT NULL,
	`event` text NOT NULL,
	`occurrence` text NOT NULL,
	`lease` integer NOT NULL,
	`due` integer NOT NULL,
	`sent` integer NOT NULL,
	PRIMARY KEY(`device`, `event`, `occurrence`)
);
--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`subscription` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_devices_owner` ON `push_devices` (`owner`);--> statement-breakpoint
CREATE TABLE `push_state` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
