export class EndpointAssessment {
  total: number;
  passed: number;
  flags: Map<string, number>;

  constructor() {
    this.total = 0;
    this.passed = 0;
    this.flags = new Map();
  }

  addFlag(flag: string): void {
    this.flags.set(flag, (this.flags.get(flag) ?? 0) + 1);
    this.total++;
  }

  addPassed(): void {
    this.passed++;
    this.total++;
  }
}

export function removeUndefinedFields(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, removeUndefinedFields(value)]),
    );
  }
  return obj;
}
