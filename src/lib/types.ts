export type ProgressPayload = {
	phase: string;
	downloaded: number | null;
	total: number | null;
	percent: number | null;
	current: number | null;
	count: number | null;
	message: string | null;
};

export type ModTag = {
	tagid: number;
	name: string;
	color: string;
};

export type Release = {
	releaseid: number;
	mainfile: string;
	filename: string;
	fileid: number;
	downloads: number;
	tags: string[];
	modidstr: string;
	modversion: string;
	created: string;
	changelog: string | null;
};

export type ModInfo = {
	mod: {
		modid: number;
		assetid: number;
		name: string;
		text: string;
		author: string;
		urlalias: string;
		logofilename: string | null;
		logofile: string | null;
		logofiledb: string | null;
		homepageurl: string | null;
		sourcecodeurl: string | null;
		trailervideourl: string | null;
		issuetrackerurl: string | null;
		wikiurl: string | null;
		downloads: number;
		follows: number;
		trendingpoints: number;
		comments: number;
		side: string;
		type: string;
		created: string;
		lastreleased: string;
		lastmodified: string;
		tags: string[];
		releases: Release[];
		screenshots: string[];
	};
	statuscode: string;
};
