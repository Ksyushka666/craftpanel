CREATE TABLE `minecraft_servers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`serverType` enum('java','bedrock') NOT NULL DEFAULT 'java',
	`core` varchar(64) NOT NULL DEFAULT 'Paper',
	`version` varchar(32) NOT NULL DEFAULT '1.21.1',
	`status` enum('online','offline','starting','stopping') NOT NULL DEFAULT 'offline',
	`maxPlayers` int NOT NULL DEFAULT 20,
	`playersOnline` int NOT NULL DEFAULT 0,
	`tps` int NOT NULL DEFAULT 20,
	`ramUsedMb` int NOT NULL DEFAULT 0,
	`ramTotalMb` int NOT NULL DEFAULT 4096,
	`cpuPercent` int NOT NULL DEFAULT 0,
	`diskUsedGb` int NOT NULL DEFAULT 0,
	`diskTotalGb` int NOT NULL DEFAULT 40,
	`address` varchar(180),
	`motd` varchar(255),
	`pvp` int NOT NULL DEFAULT 1,
	`onlineMode` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minecraft_servers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`action` varchar(32) NOT NULL,
	`payload` text,
	`output` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`sizeGb` int NOT NULL DEFAULT 0,
	`status` enum('ready','creating','restoring') NOT NULL DEFAULT 'ready',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_backups_id` PRIMARY KEY(`id`)
);
