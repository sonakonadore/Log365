CREATE TABLE `diary_records` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`period` text NOT NULL,
	`content` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
