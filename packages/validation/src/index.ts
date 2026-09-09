import { z } from "zod";

export const locationIdSchema = z.uuid();
export type LocationId = z.infer<typeof locationIdSchema>;
