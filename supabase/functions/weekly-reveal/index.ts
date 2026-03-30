// Supabase Edge Function — weekly-reveal
// Appelée par un cron job (ou manuellement).
// Pour chaque groupe, révèle les grilles dont la durée configurée est écoulée
// et met à jour groups.reveal_at en fonction de duration_days.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface GroupRow {
  id: string
  grid_size: number
  duration_days: number
  reveal_at: string | null
}

interface GridRow {
  id: string
  week_start: string
  is_revealed: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const now = new Date()

    // Récupérer tous les groupes avec leurs paramètres
    const { data: groups, error: groupsError } = await admin
      .from('groups')
      .select('id, grid_size, duration_days, reveal_at')

    if (groupsError) throw new Error(groupsError.message)
    if (!groups || groups.length === 0) {
      return Response.json({ message: 'Aucun groupe trouvé', revealed: 0 })
    }

    let totalRevealed = 0

    for (const group of groups as GroupRow[]) {
      // Récupérer les grilles non révélées de ce groupe
      const { data: grids } = await admin
        .from('grids')
        .select('id, week_start, is_revealed')
        .eq('group_id', group.id)
        .eq('is_revealed', false)

      if (!grids || grids.length === 0) continue

      for (const grid of grids as GridRow[]) {
        // Calculer la date de révélation : week_start + duration_days
        const weekStart = new Date(grid.week_start)
        const revealAt = new Date(weekStart)
        revealAt.setDate(weekStart.getDate() + group.duration_days)
        // Révéler à 20h le jour de révélation
        revealAt.setHours(20, 0, 0, 0)

        if (now >= revealAt) {
          // Révéler la grille
          await admin
            .from('grids')
            .update({ is_revealed: true })
            .eq('id', grid.id)

          totalRevealed++
        }

        // Mettre à jour reveal_at sur le groupe si nécessaire
        const revealAtStr = revealAt.toISOString()
        if (group.reveal_at !== revealAtStr) {
          await admin
            .from('groups')
            .update({ reveal_at: revealAtStr })
            .eq('id', group.id)
        }
      }
    }

    return Response.json({ revealed: totalRevealed, checked_at: now.toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
})
