/** Historical autonomous-turn metadata retained in archived messages. */
export type AutonomousTurnOrigin = { kind: 'goal-round'; round: number } | { kind: 'background-work' }
