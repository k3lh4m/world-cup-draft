import { z } from "zod";

export const ScoringRulesSchema = z.object({
  goal: z.number(),
  assist: z.number(),
  cleanSheet: z.number(),
  appearance: z.number(),
  redCard: z.number(),
});
export type ScoringRules = z.infer<typeof ScoringRulesSchema>;

export const StatSchema = z.object({
  goals: z.number(),
  assists: z.number(),
  cleanSheet: z.boolean(),
  minutes: z.number(),
  redCard: z.boolean(),
});
export type Stat = z.infer<typeof StatSchema>;

export const PositionSchema = z.enum(["GK", "DEF", "MID", "FWD"]);
export type Position = z.infer<typeof PositionSchema>;

export function scorePlayer(stats: Stat[], position: Position, rules: ScoringRules): number {
  const csEligible = position === "GK" || position === "DEF";
  return stats.reduce((total, s) => {
    let pts = s.goals * rules.goal + s.assists * rules.assist + (s.redCard ? rules.redCard : 0);
    if (s.minutes > 0) pts += rules.appearance;
    if (s.cleanSheet && csEligible) pts += rules.cleanSheet;
    return total + pts;
  }, 0);
}

export const DEFAULT_SCORING: ScoringRules = {
  goal: 5,
  assist: 3,
  cleanSheet: 4,
  appearance: 1,
  redCard: -2,
};
