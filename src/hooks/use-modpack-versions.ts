import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth";

export const useModpackVersions = (slug: string) => {
  const { data: versions } = useQuery({
    queryFn: () => authClient.getModpackVersions(slug),
    queryKey: ["modpacks", slug],
  });
  return versions;
};
