import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface NewsItem {
	title: string;
	link: string;
	description: string;
	guid: string;
	pubDate: string;
}

export const newsQueryOptions = {
	queryFn: () => invoke("fetch_news") as Promise<NewsItem[]>,
	queryKey: ["news"],
};

export const Route = createFileRoute("/news")({
	component: RouteComponent,
	errorComponent: () => <div>Error loading news.</div>,
	loader: ({ context: { queryClient } }) => {
		return queryClient.ensureQueryData(newsQueryOptions);
	},
});

function RouteComponent() {
	const { data: news, isLoading, error } = useSuspenseQuery(newsQueryOptions);

	if (isLoading) {
		return (
			<div className="flex justify-center items-center h-64">
				<Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return <div className="text-red-500">Failed to load news.</div>;
	}

	return (
		<div className="flex gap-2 flex-col px-4 py-2 h-screen w-full grid-rows-[min-content_1fr]">
			<h2 className="text-xl font-bold mb-2">Newest releases</h2>
			<div className="flex flex-col w-full space-y-4 overflow-auto">
				{news && news.length > 0 ? (
					news.map((item) => (
						<Card
							className="hover:shadow-lg transition-shadow w-full"
							key={item.guid}
						>
							<Link
								className="block"
								rel="noopener noreferrer"
								target="_blank"
								to={item.link}
							>
								<CardContent>
									<CardHeader>
										<CardTitle className="text-xl">{item.title}</CardTitle>
									</CardHeader>
									<CardDescription className="text-s text-muted-foreground mb-2 line-clamp-4">
										{item.description.replace(/<\/?[^>]+(>|$)/g, "")}
									</CardDescription>
									<CardFooter className="flex justify-end">
										<p className="text-xs text-muted-foreground">
											{new Date(item.pubDate).toLocaleString()}
										</p>
									</CardFooter>
								</CardContent>
							</Link>
						</Card>
					))
				) : (
					<div className="text-muted-foreground">No news found.</div>
				)}
			</div>
		</div>
	);
}
