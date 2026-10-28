import type { Command } from "@trektribe/core";
import type { tabPaths } from "../navigation";
export type Tab = keyof typeof tabPaths;
export type Act = (command: Command, message?: string) => Promise<boolean>;
