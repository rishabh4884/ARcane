import { loadJSON, saveJSON } from '../storage.ts';
import { LEVELS, type LevelDef } from './campaign.ts';

const KEY = 'arcane.journey.v1';

export interface LevelRecord { time: number; damageTaken: number; stars: number }
interface SaveData { completed: Record<number, LevelRecord>; learned: string[]; seen: string[]; freed: boolean; last: number }

/**
 * The journey so far: which levels are won (and how well), which legendary spells were learned,
 * which cutscenes have played, and whether the Hushwood has been freed. Kept in localStorage.
 */
export class Progress {
  private data: SaveData;
  private readonly listeners = new Set<() => void>();

  constructor() {
    const saved = loadJSON<Partial<SaveData>>(KEY);
    this.data = {
      completed: saved?.completed && typeof saved.completed === 'object' ? saved.completed : {},
      learned: Array.isArray(saved?.learned) ? saved!.learned : [],
      seen: Array.isArray(saved?.seen) ? saved!.seen : [],
      freed: saved?.freed === true,
      last: typeof saved?.last === 'number' ? saved.last : 1,
    };
  }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get learned(): readonly string[] { return this.data.learned; }
  get freed(): boolean { return this.data.freed; }
  get lastPlayed(): number { return this.data.last; }
  get started(): boolean { return Object.keys(this.data.completed).length > 0 || this.data.seen.includes('intro'); }

  isComplete(id: number): boolean { return Boolean(this.data.completed[id]); }
  record(id: number): LevelRecord | undefined { return this.data.completed[id]; }
  /** A level is open once the one before it is won. */
  isUnlocked(id: number): boolean { return id === 1 || this.isComplete(id - 1); }

  /** The first level not yet won (where Continue goes). */
  get frontier(): LevelDef {
    return LEVELS.find((l) => !this.isComplete(l.id)) ?? LEVELS[LEVELS.length - 1];
  }

  get completedCount(): number { return Object.keys(this.data.completed).length; }

  complete(level: LevelDef, time: number, damageTaken: number): { firstTime: boolean; learned: string | null; stars: number } {
    const firstTime = !this.isComplete(level.id);
    const stars = damageTaken <= 0 ? 3 : damageTaken < 40 ? 2 : 1;
    const before = this.data.completed[level.id];
    this.data.completed[level.id] = { time: before ? Math.min(before.time, time) : time, damageTaken: before ? Math.min(before.damageTaken, damageTaken) : damageTaken, stars: Math.max(before?.stars ?? 0, stars) };
    let learned: string | null = null;
    if (level.reward && !this.data.learned.includes(level.reward)) { this.data.learned.push(level.reward); learned = level.reward; }
    if (level.id === LEVELS.length) this.data.freed = true;
    this.save();
    return { firstTime, learned, stars };
  }

  hasSeen(cutscene: string): boolean { return this.data.seen.includes(cutscene); }
  markSeen(cutscene: string): void { if (!this.hasSeen(cutscene)) { this.data.seen.push(cutscene); this.save(); } }
  setLast(id: number): void { this.data.last = id; this.save(); }

  reset(): void {
    this.data = { completed: {}, learned: [], seen: [], freed: false, last: 1 };
    this.save();
  }

  private save(): void {
    saveJSON(KEY, this.data);
    this.listeners.forEach((fn) => fn());
  }
}
