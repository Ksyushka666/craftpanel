CREATE TABLE `server_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_members_server_user_unique` UNIQUE(`serverId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `server_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`cronExpression` varchar(64) NOT NULL,
	`action` enum('restart') NOT NULL DEFAULT 'restart',
	`taskUid` varchar(65),
	`enabled` int NOT NULL DEFAULT 1,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_schedules_task_uid_unique` UNIQUE(`taskUid`)
);
--> statement-breakpoint
CREATE TABLE `server_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`externalHookId` varchar(128) NOT NULL,
	`secret` varchar(255) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`lastEventId` varchar(160),
	`lastEventAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_webhooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_webhooks_external_unique` UNIQUE(`serverId`,`externalHookId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` int NOT NULL,
	`eventKey` varchar(190) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_key_unique` UNIQUE(`webhookId`,`eventKey`)
);
--> statement-breakpoint
CREATE INDEX `server_members_user_idx` ON `server_members` (`userId`);--> statement-breakpoint
CREATE INDEX `server_schedules_owner_idx` ON `server_schedules` (`ownerId`);