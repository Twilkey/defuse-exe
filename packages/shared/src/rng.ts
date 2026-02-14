export class SeededRng {
  private state: number;

  constructor(seed: string) {
    let hash = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    this.state = hash >>> 0;
  }

  private nextRaw(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  next(): number {
    return this.nextRaw();
  }

  int(min: number, max: number): number {
    return Math.floor(this.nextRaw() * (max - min + 1)) + min;
  }

  pick<T>(values: T[]): T {
    return values[this.int(0, values.length - 1)];
  }

  shuffle<T>(values: T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.nextRaw() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }
}
