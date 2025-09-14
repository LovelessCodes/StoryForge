import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { newsQueryOptions } from "../news";

export const Route = createFileRoute("/news/$id")({
	component: RouteComponent,
	errorComponent: () => <div>Error loading news.</div>,
	loader: ({ context: { queryClient } }) => {
		return queryClient.ensureQueryData(newsQueryOptions);
	},
});

function RouteComponent() {
	const { id } = Route.useParams();
	const { data: newsArticles } = useSuspenseQuery(newsQueryOptions);
	const newsArticle = newsArticles.find((article) => article.guid === id);
	return (
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Needed to display news article
		<div dangerouslySetInnerHTML={{ __html: newsArticle?.description ?? "" }} />
	);
}
