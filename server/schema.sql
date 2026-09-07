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
--> statement-breakpoint
CREATE TABLE `groups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `invite_code` text NOT NULL UNIQUE,
  `owner_key` text NOT NULL,
  `space` text NOT NULL UNIQUE,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_members` (
  `group_id` text NOT NULL,
  `user_key` text NOT NULL,
  `name` text NOT NULL,
  `role` text NOT NULL DEFAULT 'member',
  `joined` integer NOT NULL,
  PRIMARY KEY(`group_id`,`user_key`)
);
--> statement-breakpoint
CREATE INDEX `group_members_user` ON `group_members` (`user_key`,`group_id`);
--> statement-breakpoint
CREATE TABLE `group_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `group_id` text NOT NULL,
  `user_key` text NOT NULL,
  `name` text NOT NULL,
  `body` text NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `group_messages_group_id` ON `group_messages` (`group_id`,`id`);
