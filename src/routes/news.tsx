import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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
	const {
		data: news,
		isLoading,
		error,
	} = useSuspenseQuery(newsQueryOptions);

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
		<div className="flex flex-col gap-6 px-4 py-2">
			<h1 className="text-3xl font-bold mb-4">Vintage Story News</h1>
            <div className="flex gap-2 flex-col">
                <h2 className="text-xl font-bold mb-2">Newest releases</h2>
                <ScrollArea className="w-[calc(100vw-10rem-32px)]">
                    <div className="flex w-max space-x-4">
                        {news && news.length > 0 ? (
                            news.map((item) => (
                                <Card className="hover:shadow-lg transition-shadow w-[300px]" key={item.guid}>
                                    <Link
                                        className="block"
                                        rel="noopener noreferrer"
                                        target="_blank"
                                        to={item.link}
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-xl mb-1">{item.title}</CardTitle>
                                            <CardDescription className="text-xs text-muted-foreground mb-2">
                                                {new Date(item.pubDate).toLocaleString()}
                                            </CardDescription>
                                        </CardHeader>
                                    </Link>
                                </Card>
                            ))
                        ) : (
                            <div className="text-muted-foreground">No news found.</div>
                        )}
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </div>
		</div>
	);
}
