export type HandSide = 'left' | 'right';
export interface Vec3 { x: number; y: number; z: number }
export interface HandFrame { time: number; landmarks: Vec3[]; aspect: number; confidence: number; side?: HandSide }
export const LM = { WRIST: 0, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_TIP: 12, RING_MCP: 13, RING_TIP: 16, PINKY_MCP: 17, PINKY_TIP: 20 } as const;
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
