CREATE TABLE `peers` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`token` text NOT NULL,
	`client_key` text NOT NULL DEFAULT '',
	`name` text NOT NULL,
	`avatar` text NOT NULL DEFAULT '',
	`profile_version` integer NOT NULL DEFAULT 0,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `peers_room_seen` ON `peers` (`room`,`seen`);--> statement-breakpoint
CREATE UNIQUE INDEX `peers_room_client` ON `peers` (`room`,`client_key`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`sender` text NOT NULL,
	`target` text NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signals_room_target` ON `signals` (`room`,`target`,`id`);

--> statement-breakpoint
CREATE TABLE `messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `room` text NOT NULL,
  `sender` text NOT NULL,
  `name` text NOT NULL,
  `body` text NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_room_id` ON `messages` (`room`,`id`);
