// The release log (src/data/releases.json), newest first. Written in French and English only:
// release notes are content, not interface text, so other languages read the English.
import data from "../data/releases.json";

export type ChangeKind = "feature" | "improvement" | "performance" | "fix";

export type Release = {
  id: string;
  version: string;
  date: string;
  title: Record<string, string>;
  changes: ({ kind: ChangeKind } & Record<string, string>)[];
};

export const releases = data as Release[];

/** Reading order: what is new, what is better, what is faster, what is fixed. */
export const CHANGE_KINDS: ChangeKind[] = ["feature", "improvement", "performance", "fix"];

export const releaseText = (text: Record<string, string>, language: string) =>
  text[language.slice(0, 2)] ?? text.en ?? text.fr ?? "";
