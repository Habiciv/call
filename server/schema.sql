CREATE TABLE `peers` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `peers_room_seen` ON `peers` (`room`,`seen`);--> statement-breakpoint
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