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
