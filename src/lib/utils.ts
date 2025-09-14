import { platform } from "@tauri-apps/plugin-os";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function capitalizeFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

export function makeStringFolderSafe(string: string) {
	return string.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function parseVer(v: string) {
	const parts = String(v).trim().split(".");
	const major = Number(parts[0] ?? 0) || 0;
	const minor = Number(parts[1] ?? 0) || 0;
	const patch = Number(parts[2] ?? 0) || 0;
	return [major, minor, patch];
}

export function compareSemverDesc(a: string, b: string) {
	const [ma, mi, pa] = parseVer(a);
	const [mb, mj, pb] = parseVer(b);
	if (ma !== mb) return mb - ma;
	if (mi !== mj) return mj - mi;
	return pb - pa;
}

export function compareSemverAsc(a: string, b: string) {
	const [ma, mi, pa] = parseVer(a);
	const [mb, mj, pb] = parseVer(b);
	if (ma !== mb) return ma - mb;
	if (mi !== mj) return mi - mj;
	return pa - pb;
}

export const zipfolderprefix = () => {
	const currentPlatform = platform();
	const pf = currentPlatform.charAt(0).toLowerCase();
	if (pf === "w") return "app/";
	if (pf === "l") return "AppImage/";
	if (pf === "m") return "*.app/";
	return "";
};
