import { supabase } from './supabase'
import type { Cell, Grid, User } from '../../supabase/types'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OnboardingAnswers {
  weekendActivity: string[]
  badHabit: string
  partyStyle: string[]
}

export interface GeneratedGrid {
  grid: Grid
  cells: Cell[]
}

// ─────────────────────────────────────────────────────────────
// Templates personnalisés
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

/** Lundi de la semaine ISO courante au format YYYY-MM-DD */
function currentWeekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Distribue 9 cases sur N membres aussi équitablement que possible.
 * Retourne un tableau de 9 userId (shufflé).
 */
export function distributeTargets(members: User[]): string[] {
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

/**
 * Collecte les templates personnalisés pour un utilisateur cible.
 */
export function personalizedTemplates(answers: OnboardingAnswers): string[] {
  const templates: string[] = []

  for (const activity of answers.weekendActivity) {
    if (WEEKEND_TEMPLATES[activity]) templates.push(WEEKEND_TEMPLATES[activity])
  }

  for (const style of answers.partyStyle) {
    if (PARTY_TEMPLATES[style]) templates.push(PARTY_TEMPLATES[style])
  }

  if (answers.badHabit?.trim()) {
    templates.push(`{{u}} va ${answers.badHabit.trim().toLowerCase()} cette semaine`)
  }

  return templates
}

/**
 * Génère le contenu d'une case, en évitant les doublons.
 * 60% personnalisé (si disponible), 40% universel.
 */
export function generateCellContent(
  username: string,
  answers: OnboardingAnswers,
  usedContents: Set<string>
): string {
  const perso = personalizedTemplates(answers)

  for (let attempt = 0; attempt < 20; attempt++) {
    let template: string

    if (perso.length > 0 && Math.random() < 0.6) {
      template = pick(perso)
    } else {
      template = pick(UNIVERSAL_POOL)
    }

    const content = template.replace(/\{\{u\}\}/g, username)
    if (!usedContents.has(content)) return content
  }

  // Fallback : universel non dupliqué ou forcé
  const fallback = pick(UNIVERSAL_POOL).replace(/\{\{u\}\}/g, username)
  return fallback
}

// ─────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────

/**
 * Génère et insère une grille 3×3 pour un utilisateur.
 * Utilise le client Supabase frontend (respecte le RLS).
 */
export async function generateGridForUser(
  userId: string,
  groupId: string
): Promise<GeneratedGrid> {
  // 1. Récupérer les autres membres du groupe
  const { data: members, error: membersError } = await supabase
    .from('users')
    .select('*')
    .eq('group_id', groupId)
    .neq('id', userId)

  if (membersError) throw new Error('Erreur lecture membres : ' + membersError.message)
  if (!members || members.length === 0) throw new Error('Aucun autre membre dans le groupe')

  // 2. Distribuer les 9 cibles
  const targetIds = distributeTargets(members)
  const memberMap = new Map(members.map((m) => [m.id, m]))

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

  // 4. Générer les 9 cases
  const usedContents = new Set<string>()
  const cellInserts = targetIds.map((targetId) => {
    const target = memberMap.get(targetId)!
    const answers = (target.onboarding_answers ?? {}) as OnboardingAnswers
    const content = generateCellContent(target.username, answers, usedContents)
    usedContents.add(content)

    return {
      grid_id: grid.id,
      target_user_id: targetId,
      content,
      is_auto_generated: true,
    }
  })

  const { data: cells, error: cellsError } = await supabase
    .from('cells')
    .insert(cellInserts)
    .select()

  if (cellsError || !cells) throw new Error('Erreur insertion cases : ' + cellsError?.message)

  return { grid, cells }
}
