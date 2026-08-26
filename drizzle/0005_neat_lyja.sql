CREATE TABLE `server_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`level` enum('system','info','warn','error','debug') NOT NULL DEFAULT 'info',
	`source` varchar(64) NOT NULL DEFAULT 'minecraft',
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `server_actions` MODIFY COLUMN `action` varchar(64) NOT NULL;