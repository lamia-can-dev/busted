import { supabase } from './supabase'
import type { User } from '../../supabase/types'

// ─────────────────────────────────────────────────────────────
// Helpers date
// ─────────────────────────────────────────────────────────────

/** Lundi de la semaine ISO courante au format YYYY-MM-DD */
export function currentWeekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface OnboardingAnswers {
  job?: string
  teuf?: string
  food?: string
  defaut?: string
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fill(template: string, username: string): string {
  return template.replace(/\{\{username\}\}/g, username)
}

// ─────────────────────────────────────────────────────────────
// Règles par réponse
// ─────────────────────────────────────────────────────────────

const JOB_RULES: Record<string, string[]> = {
  'Dev': [
    '{{username}} va passer plus de 2h sur un bug qui était une faute de frappe',
    '{{username}} va ouvrir une PR sans description',
    "{{username}} va dire \"c'est pas un bug, c'est une feature\"",
    '{{username}} va commiter directement sur main',
    "{{username}} va lancer des tests en local et dire \"ça marche chez moi\"",
  ],
  'Product': [
    "{{username}} va mentionner le mot 'roadmap' plus de 3 fois dans la journée",
    '{{username}} va planifier une réunion qui aurait pu être un email',
    '{{username}} va présenter une slide avec un graphique en camembert',
    "{{username}} va dire 'les utilisateurs veulent…' sans avoir parlé à un seul",
    "{{username}} va créer un nouveau Notion pour 'mieux s'organiser'",
  ],
  'Tech Lead': [
    '{{username}} va bloquer une PR pour un problème de naming',
    "{{username}} va dire 'on devrait refactoriser ça' sans le faire",
    "{{username}} va expliquer la dette technique à quelqu'un qui n'a pas demandé",
    "{{username}} va ouvrir une discussion d'architecture qui dure plus d'une heure",
    '{{username}} va demander des tests pour une PR de 2 lignes',
  ],
  'Sales': [
    '{{username}} va envoyer un message Slack avec 3 emojis ou plus',
    "{{username}} va dire 'on a failli closer' en réunion",
    "{{username}} va appeler un client 'mon ami'",
    '{{username}} va relancer un prospect qui avait dit non',
    "{{username}} va terminer un message par 'N'hésitez pas !'",
  ],
  'Autres': [
    "{{username}} va demander qui peut l'aider avec Excel",
    "{{username}} va envoyer un email en répondant à tous par erreur",
    "{{username}} va oublier d'être en sourdine pendant un call",
    '{{username}} va imprimer un document pour le relire',
    "{{username}} va dire 'je viens juste pour 5 min' et rester 30",
  ],
}

const TEUF_RULES: Record<string, string[]> = {
  'Organisateur en chef': [
    '{{username}} va proposer une sortie ce week-end',
    '{{username}} va créer un groupe WhatsApp pour organiser la soirée',
    '{{username}} va faire un sondage Doodle pour caler une date',
    '{{username}} va envoyer un rappel à tout le groupe 24h avant',
    "{{username}} va arriver en premier et attendre les autres en faisant les 100 pas",
  ],
  'Présent mais discret': [
    '{{username}} va arriver à la soirée, rester 45 min et partir sans dire au revoir',
    "{{username}} va s'installer dans un coin avec son téléphone toute la soirée",
    "{{username}} va dire 'je suis là en vrai' quand quelqu'un lui demande s'il s'amuse",
    '{{username}} va refuser de monter sur la piste de danse',
    "{{username}} va partir tôt 'parce qu'il a quelque chose demain'",
  ],
  'Je viens pour manger': [
    "{{username}} va finir l'apéro avant que tout le monde arrive",
    "{{username}} va demander ce qu'il y a à manger avant de confirmer sa présence",
    '{{username}} va se resservir en premier',
    '{{username}} va prendre la plus grosse part',
    "{{username}} va poser la question 'c'est quoi le dessert ?' avant le plat",
  ],
  'Plutôt soirée canapé': [
    '{{username}} va décliner une invitation ce week-end',
    '{{username}} va finir une série Netflix en une soirée',
    '{{username}} va être en pyjama avant 20h un vendredi',
    "{{username}} va dire 'j'avais prévu de sortir mais finalement non'",
    '{{username}} va commander à livrer plutôt que de se lever pour cuisiner',
  ],
}

const FOOD_RULES: Record<string, string[]> = {
  'Healthy & équilibré': [
    "{{username}} va parler de ce qu'il a mangé au déjeuner",
    "{{username}} va refuser le dessert 'parce qu'il fait attention'",
    '{{username}} va montrer une photo de son repas fait maison',
    '{{username}} va apporter une salade en réunion',
    "{{username}} va demander si c'est 'bio ou local' au resto",
  ],
  'Fast food assumé': [
    '{{username}} va commander à manger plutôt que cuisiner',
    '{{username}} va défendre McDo dans une conversation',
    '{{username}} va manger au bureau devant son écran',
    "{{username}} va dire 'c'est de la qualité' en mangeant un burger",
    '{{username}} va récidiver le lendemain',
  ],
  'Je mange n\'importe quoi': [
    '{{username}} va manger quelque chose qui traîne depuis 3 jours au frigo',
    "{{username}} va sauter le petit-déjeuner et dire que 'c'est pareil'",
    "{{username}} va finir les restes de quelqu'un d'autre",
    "{{username}} va mélanger des aliments que personne d'autre ne mangerait ensemble",
    "{{username}} va dire 'ça va, c'est encore bon' sur quelque chose de douteux",
  ],
  'Veggie / vegan': [
    '{{username}} va mentionner son régime végé dans une conversation non liée',
    '{{username}} va commander le seul plat végétarien du menu et le regretter',
    '{{username}} va lire les étiquettes au supermarché pendant 5 min',
    "{{username}} va refuser quelque chose en disant 'je vérifie les ingrédients d'abord'",
    '{{username}} va suggérer un resto végétarien que personne ne connaît',
  ],
}

// ─────────────────────────────────────────────────────────────
// Fonction principale (pure)
// ─────────────────────────────────────────────────────────────

export function suggestChallenges(username: string, answers: OnboardingAnswers): string[] {
  const suggestions: string[] = []

  // Job
  const jobRules = answers.job ? JOB_RULES[answers.job] : null
  if (jobRules) {
    for (const rule of jobRules) suggestions.push(fill(rule, username))
  }

  // Teuf
  const teufRules = answers.teuf ? TEUF_RULES[answers.teuf] : null
  if (teufRules) {
    for (const rule of teufRules) suggestions.push(fill(rule, username))
  }

  // Food
  const foodRules = answers.food ? FOOD_RULES[answers.food] : null
  if (foodRules) {
    for (const rule of foodRules) suggestions.push(fill(rule, username))
  }

  // Défaut (champ libre)
  if (answers.defaut?.trim()) {
    const d = answers.defaut.trim().toLowerCase()
    suggestions.push(fill(`{{username}} va ${d}`, username))
    suggestions.push(fill(`{{username}} va encore ${d} cette semaine`, username))
    suggestions.push(fill(`Quelqu'un va surprendre {{username}} en train de ${d}`, username))
  }

  return suggestions
}

// ─────────────────────────────────────────────────────────────
// Génération de semaine (DB)
// ─────────────────────────────────────────────────────────────

/**
 * Génère et insère les suggestions pour tous les membres du groupe.
 * Idempotent : ne fait rien si des suggestions existent déjà cette semaine.
 */
export async function generateGroupSuggestions(
  groupId: string,
  weekStart: string
): Promise<void> {
  // Vérifier si des suggestions existent déjà pour ce groupe cette semaine
  const { count } = await supabase
    .from('suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .gte('created_at', weekStart)

  if ((count ?? 0) > 0) return // Déjà générées

  // Récupérer tous les membres du groupe
  const { data: members } = await supabase
    .from('users')
    .select('id, username, onboarding_answers')
    .eq('group_id', groupId)

  if (!members || members.length === 0) return

  // Générer les suggestions pour chaque membre
  const rows: { group_id: string; target_user_id: string; content: string }[] = []

  for (const member of members as User[]) {
    const answers = (member.onboarding_answers ?? {}) as OnboardingAnswers
    const contents = suggestChallenges(member.username, answers)
    for (const content of contents) {
      rows.push({ group_id: groupId, target_user_id: member.id, content })
    }
  }

  if (rows.length > 0) {
    await supabase.from('suggestions').insert(rows)
  }
}
