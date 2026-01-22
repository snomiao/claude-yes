import { CLIS_CONFIG } from "./index.ts";

export const SUPPORTED_CLIS = Object.keys(CLIS_CONFIG) as SUPPORTED_CLIS[];
export type SUPPORTED_CLIS = keyof typeof CLIS_CONFIG;
