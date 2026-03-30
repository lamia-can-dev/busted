import { supabase } from './supabase'
import type { Cell, Grid } from '../../supabase/types'
import { currentWeekStart, generateGroupSuggestions } from './suggestChallenges'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface GeneratedGrid {
  grid: Grid
  cells: Cell[]
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────

/**
 * Génère et insère une grille pour un utilisateur
 * en piochant grid_size² paris du pool partagé du groupe,
 * en excluant les paris qui ciblent cet utilisateur.
 */
export async function generateGridFromPool(
  userId: string,
  groupId: string
): Promise<GeneratedGrid> {
  // 0. Récupérer les paramètres du groupe
  const { data: group } = await supabase
    .from('groups')
    .select('grid_size')
    .eq('id', groupId)
    .single()

  const gridSize = group?.grid_size ?? 3
  const cellCount = gridSize * gridSize

  // 1. Récupérer tous les paris du groupe sauf ceux qui ciblent l'utilisateur
  const { data: proposals, error: proposalsError } = await supabase
    .from('proposals')
    .select('*')
    .eq('group_id', groupId)
    .neq('target_user_id', userId)
    .eq('is_approved', true)

  if (proposalsError) throw new Error('Erreur lecture pool : ' + proposalsError.message)
  if (!proposals || proposals.length < cellCount)
    throw new Error(`Pas assez de paris approuvés dans le pool (minimum ${cellCount} requis)`)

  // 2. Mélanger et prendre cellCount (tous uniques)
  const picked = shuffle(proposals).slice(0, cellCount)

  // 3. Créer la grille
  const weekStart = currentWeekStart()
  const { data: grid, error: gridError } = await supabase
    .from('grids')
    .insert({
      owner_user_id: userId,
      group_id: groupId,
      week_start: weekStart,
      is_revealed: false,
    })
    .select()
    .single()

  if (gridError || !grid) throw new Error('Erreur création grille : ' + gridError?.message)

  // 4. Insérer les 9 cases
  const { data: cells, error: cellsError } = await supabase
    .from('cells')
    .insert(
      picked.map((p, i) => ({
        grid_id: grid.id,
        target_user_id: p.target_user_id,
        content: p.content,
        is_auto_generated: false,
        position: i,
      }))
    )
    .select()

  if (cellsError || !cells) throw new Error('Erreur insertion cases : ' + cellsError?.message)

  // Générer les suggestions de défis pour la semaine (idempotent)
  await generateGroupSuggestions(groupId, weekStart)

  return { grid, cells }
}
