export type ProgressPayload = {
	phase: string;
	downloaded: number | null;
	total: number | null;
	percent: number | null;
	current: number | null;
	count: number | null;
	message: string | null;
};