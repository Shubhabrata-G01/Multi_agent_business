// Line-based diff between two artifact-version attempts (STEP 5 item 4).
// A small in-house LCS diff rather than a new dependency - artifact bodies
// are markdown documents, at most a few hundred lines, well within where an
// O(n*m) LCS is fine.
export interface DiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the LCS of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "unchanged", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "removed", text: a[i] });
      i++;
    } else {
      result.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "removed", text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", text: b[j] });
    j++;
  }
  return result;
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, unchanged: 0 };
  for (const line of lines) summary[line.type === "unchanged" ? "unchanged" : line.type]++;
  return summary;
}
