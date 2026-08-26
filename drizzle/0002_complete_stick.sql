CREATE TABLE `catalog_installations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`catalogType` enum('modpack','plugin','map') NOT NULL,
	`name` varchar(160) NOT NULL,
	`version` varchar(64) NOT NULL,
	`status` enum('queued','installed','failed') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_installations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serverId` int NOT NULL,
	`ownerId` int NOT NULL,
	`path` varchar(255) NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` enum('file','folder') NOT NULL DEFAULT 'file',
	`sizeBytes` int NOT NULL DEFAULT 0,
	`storageKey` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_files_id` PRIMARY KEY(`id`)
);
