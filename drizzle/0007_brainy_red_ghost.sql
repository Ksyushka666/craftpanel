CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`serverId` int,
	`action` varchar(100) NOT NULL,
	`target` varchar(255),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`inviterId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_invitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorId`);--> statement-breakpoint
CREATE INDEX `audit_logs_server_idx` ON `audit_logs` (`serverId`);--> statement-breakpoint
CREATE INDEX `server_invitations_server_idx` ON `server_invitations` (`serverId`);