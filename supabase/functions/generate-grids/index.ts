// Supabase Edge Function — generate-grids
// POST { group_id: string }
// Génère une grille pour chaque membre du groupe (service role, bypass RLS)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface OnboardingAnswers {
  weekendActivity: string[]
  badHabit: string
  partyStyle: string[]
}

interface UserRow {
  id: string
  group_id: string
  username: string
  avatar_url: string | null
  onboarding_answers: OnboardingAnswers | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Templates (dupliqués depuis src/lib/generateGrid.ts)
// ─────────────────────────────────────────────────────────────

const WEEKEND_TEMPLATES: Record<string, string> = {
  'Netflix':        '{{u}} va regarder une série en entier ce week-end',
  'Sortir':         '{{u}} va rentrer après 3h du matin ce week-end',
  'Sport':          '{{u}} va poster sa séance de sport sur les réseaux',
  'Cuisine':        '{{u}} va rater une recette et commander à la place',
  'Flemme totale':  '{{u}} va passer le week-end en pyjama sans culpabiliser',
}

const PARTY_TEMPLATES: Record<string, string> = {
  'Le premier parti':       '{{u}} va partir avant 23h',
  'Le dernier debout':      '{{u}} va être le dernier à partir',
  'Celui qui mange tout':   '{{u}} va finir les chips de tout le monde',
  'Le photographe':         '{{u}} va faire 50 photos dont personne ne voudra',
}

const UNIVERSAL_POOL: string[] = [
  '{{u}} va commander à manger plutôt que cuisiner',
  '{{u}} va annuler des plans au dernier moment',
  '{{u}} va poster une story ce week-end',
  '{{u}} va répondre « ça dépend » à une question simple',
  '{{u}} va être en retard à un rendez-vous',
  '{{u}} va checker son téléphone toutes les 5 minutes',
]

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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function currentWeekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function distributeTargets(members: UserRow[]): string[] {
  const n = members.length
  const base = Math.floor(9 / n)
  const remainder = 9 % n
  const slots: string[] = []
  members.forEach((m, i) => {
    const count = base + (i < remainder ? 1 : 0)
    for (let j = 0; j < count; j++) slots.push(m.id)
  })
  return shuffle(slots)
}

function personalizedTemplates(answers: OnboardingAnswers): string[] {
  const templates: string[] = []
  for (const a of answers.weekendActivity ?? []) {
    if (WEEKEND_TEMPLATES[a]) templates.push(WEEKEND_TEMPLATES[a])
  }
  for (const s of answers.partyStyle ?? []) {
    if (PARTY_TEMPLATES[s]) templates.push(PARTY_TEMPLATES[s])
  }
  if (answers.badHabit?.trim()) {
    templates.push(`{{u}} va ${answers.badHabit.trim().toLowerCase()} cette semaine`)
  }
  return templates
}

function generateCellContent(
  username: string,
  answers: OnboardingAnswers,
  usedContents: Set<string>
): string {
  const perso = personalizedTemplates(answers)
  for (let attempt = 0; attempt < 20; attempt++) {
    const template =
      perso.length > 0 && Math.random() < 0.6 ? pick(perso) : pick(UNIVERSAL_POOL)
    const content = template.replace(/\{\{u\}\}/g, username)
    if (!usedContents.has(content)) return content
  }
  return pick(UNIVERSAL_POOL).replace(/\{\{u\}\}/g, username)
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

    const weekStart = currentWeekStart()
    const memberMap = new Map<string, UserRow>(allMembers.map((m: UserRow) => [m.id, m]))

    const gridsToInsert: object[] = []
    const cellsByOwner: Map<string, object[]> = new Map()

    // Générer grilles et cases pour chaque membre
    for (const owner of allMembers as UserRow[]) {
      const others = allMembers.filter((m: UserRow) => m.id !== owner.id) as UserRow[]
      const targetIds = distributeTargets(others)
      const usedContents = new Set<string>()

      const cells = targetIds.map((targetId) => {
        const target = memberMap.get(targetId)!
        const answers = (target.onboarding_answers ?? {}) as OnboardingAnswers
        const content = generateCellContent(target.username, answers, usedContents)
        usedContents.add(content)
        return { target_user_id: targetId, content, is_auto_generated: true }
      })

      gridsToInsert.push({
        owner_user_id: owner.id,
        group_id,
        week_start: weekStart,
        is_revealed: false,
      })
      cellsByOwner.set(owner.id, cells)
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
