export interface BingoCell {
  status?: string
}

function isComplete(cell: BingoCell | undefined): boolean {
  return cell?.status === 'busted'
}

/** Indices (0-based) des lignes entièrement validées */
export function checkLines(cells: BingoCell[], gridSize: number): number[] {
  const result: number[] = []
  for (let r = 0; r < gridSize; r++) {
    if (Array.from({ length: gridSize }, (_, c) => cells[r * gridSize + c]).every(isComplete))
      result.push(r)
  }
  return result
}

/** Indices (0-based) des colonnes entièrement validées */
export function checkColumns(cells: BingoCell[], gridSize: number): number[] {
  const result: number[] = []
  for (let c = 0; c < gridSize; c++) {
    if (Array.from({ length: gridSize }, (_, r) => cells[r * gridSize + c]).every(isComplete))
      result.push(c)
  }
  return result
}

/** [diagonale principale complète, anti-diagonale complète] */
export function checkDiagonals(cells: BingoCell[], gridSize: number): [boolean, boolean] {
  const main = Array.from({ length: gridSize }, (_, i) => cells[i * gridSize + i]).every(isComplete)
  const anti = Array.from({ length: gridSize }, (_, i) => cells[i * gridSize + (gridSize - 1 - i)]).every(isComplete)
  return [main, anti]
}

/** true si au moins une ligne/colonne/diagonale est complète */
export function hasBingo(cells: BingoCell[], gridSize: number): boolean {
  if (checkLines(cells, gridSize).length > 0) return true
  if (checkColumns(cells, gridSize).length > 0) return true
  return checkDiagonals(cells, gridSize).some(Boolean)
}

/** Nombre de cases dont le statut est 'busted' */
export function getCompletedCount(cells: BingoCell[]): number {
  return cells.filter((c) => c?.status === 'busted').length
}
