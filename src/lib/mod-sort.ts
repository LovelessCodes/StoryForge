/** Sort keys for the mod browser list. */
export type SortBy =
  | "relevance"
  | "created"
  | "name"
  | "trending"
  | "downloads"
  | "follows"
  | "comments"
  | "updated";

export const sortOptions: Record<SortBy, string> = {
  comments: "Comments",
  created: "Created",
  downloads: "Downloads",
  follows: "Follows",
  name: "Name",
  relevance: "Relevance",
  trending: "Trending",
  updated: "Last Updated",
};
