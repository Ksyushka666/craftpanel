export type ServerStatus = "online" | "offline" | "starting" | "stopping";
export type ServerType = "java" | "bedrock";

export type ServerListFilters = {
  query: string;
  status: "all" | ServerStatus;
  serverType: "all" | ServerType;
  sort: "name" | "status" | "players" | "ram";
};

export type FilterableServer = {
  name: string;
  status: ServerStatus;
  serverType: ServerType;
  playersOnline: number;
  ramUsedMb: number;
};

const statusRank: Record<ServerStatus, number> = {
  online: 0,
  starting: 1,
  stopping: 2,
  offline: 3,
};

export function filterAndSortServers<T extends FilterableServer>(
  servers: T[],
  filters: ServerListFilters,
): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return servers
    .filter(server => {
      const matchesQuery = !query || server.name.toLocaleLowerCase().includes(query);
      const matchesStatus = filters.status === "all" || server.status === filters.status;
      const matchesType = filters.serverType === "all" || server.serverType === filters.serverType;
      return matchesQuery && matchesStatus && matchesType;
    })
    .sort((left, right) => {
      if (filters.sort === "players") return right.playersOnline - left.playersOnline;
      if (filters.sort === "ram") return right.ramUsedMb - left.ramUsedMb;
      if (filters.sort === "status") return statusRank[left.status] - statusRank[right.status] || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
}
