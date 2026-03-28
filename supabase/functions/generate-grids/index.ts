// Supabase Edge Function — generate-grids
// POST { group_id: string }
// Génère une grille 4×4 pour chaque membre du groupe en piochant dans le pool de paris partagé

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  group_id: string
  username: string
  avatar_url: string | null
  onboarding_answers: unknown
  created_at: string
}

interface ProposalRow {
  target_user_id: string
  content: string
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

function currentWeekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

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
    const { group_id } = await req.json() as { group_id?: string }
    if (!group_id) {
      return Response.json({ error: 'group_id requis' }, { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Récupérer tous les membres du groupe
    const { data: allMembers, error: membersError } = await admin
      .from('users')
      .select('*')
      .eq('group_id', group_id)

    if (membersError) throw new Error(membersError.message)
    if (!allMembers || allMembers.length < 2) {
      return Response.json({ error: 'Pas assez de membres (minimum 2)' }, { status: 422 })
    }

    // Récupérer tous les paris du pool partagé
    const { data: allProposals, error: proposalsError } = await admin
      .from('proposals')
      .select('target_user_id, content')
      .eq('group_id', group_id)
      .eq('is_approved', true)

    if (proposalsError) throw new Error(proposalsError.message)
    if (!allProposals || allProposals.length === 0) {
      return Response.json({ error: 'Aucun pari approuvé — votez sur les paris avant de générer les grilles' }, { status: 422 })
    }

    const weekStart = currentWeekStart()

    // Récupérer les membres qui ont déjà une grille cette semaine
    const { data: existingGrids } = await admin
      .from('grids')
      .select('owner_user_id')
      .eq('group_id', group_id)
      .eq('week_start', weekStart)

    const alreadyHasGrid = new Set((existingGrids ?? []).map((g: { owner_user_id: string }) => g.owner_user_id))
    const membersToGenerate = (allMembers as UserRow[]).filter((m) => !alreadyHasGrid.has(m.id))

    if (membersToGenerate.length === 0) {
      return Response.json({ message: 'Tous les membres ont déjà une grille cette semaine', generated: 0 })
    }

    const gridsToInsert: object[] = []
    const cellsByOwner: Map<string, object[]> = new Map()

    // Générer les cases pour chaque membre sans grille
    for (const owner of membersToGenerate) {
      const eligible = (allProposals as ProposalRow[]).filter(
        (p) => p.target_user_id !== owner.id
      )
      if (eligible.length < 9) {
        return Response.json(
          { error: `Pas assez de paris pour ${owner.username} (${eligible.length}/9 disponibles)` },
          { status: 422 }
        )
      }
      const picked = shuffle(eligible).slice(0, 9)
      gridsToInsert.push({
        owner_user_id: owner.id,
        group_id,
        week_start: weekStart,
        is_revealed: false,
      })
      cellsByOwner.set(
        owner.id,
        picked.map((p) => ({
          target_user_id: p.target_user_id,
          content: p.content,
          is_auto_generated: false,
        }))
      )
    }

    // Insérer toutes les grilles
    const { data: grids, error: gridsError } = await admin
      .from('grids')
      .insert(gridsToInsert)
      .select('id, owner_user_id')

    if (gridsError || !grids) throw new Error('Erreur insertion grilles : ' + gridsError?.message)

    // Insérer toutes les cases
    const allCellInserts: object[] = []
    for (const grid of grids) {
      const cells = cellsByOwner.get(grid.owner_user_id) ?? []
      for (const cell of cells) {
        allCellInserts.push({ ...cell, grid_id: grid.id })
      }
    }

    const { error: cellsError } = await admin.from('cells').insert(allCellInserts)
    if (cellsError) throw new Error('Erreur insertion cases : ' + cellsError.message)

    return Response.json({
      generated: grids.length,
      total_cells: allCellInserts.length,
      week_start: weekStart,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
})
