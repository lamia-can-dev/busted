export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─────────────────────────────────────────────────────────────
// Database — racine des types générés
// ─────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      groups: GroupsTable
      users: UsersTable
      grids: GridsTable
      cells: CellsTable
      submissions: SubmissionsTable
      votes: VotesTable
      proposals: ProposalsTable
      suggestions: SuggestionsTable
    }
    Views: Record<string, never>
    Functions: {
      current_user_group_id: {
        Args: Record<string, never>
        Returns: string
      }
      increment_vote_count: {
        Args: { proposal_id: string }
        Returns: { vote_count: number; is_approved: boolean }
      }
    }
    Enums: Record<string, never>
  }
}

// ─────────────────────────────────────────────────────────────
// Row types (lecture depuis Supabase)
// NOTE: must be `type` aliases, not `interface`, so they satisfy
//       Record<string, unknown> in conditional types (TS quirk).
// ─────────────────────────────────────────────────────────────

export type Group = {
  id: string
  name: string
  invite_code: string
  created_at: string
  reveal_at: string | null
  grid_size: number
  duration_days: number
}

export type User = {
  id: string
  group_id: string
  username: string
  avatar_url: string | null
  onboarding_answers: Json | null
  created_at: string
}

export type Grid = {
  id: string
  owner_user_id: string
  group_id: string
  week_start: string        // date ISO (YYYY-MM-DD)
  is_revealed: boolean
  created_at: string
}

export type Cell = {
  id: string
  grid_id: string
  target_user_id: string
  content: string | null
  position: number
  status: 'unchecked' | 'pending_confirmation' | 'pending_vote' | 'busted' | 'rejected'
  is_auto_generated: boolean
  created_at: string
}

export type Submission = {
  id: string
  cell_id: string
  submitter_user_id: string
  proof_text: string | null
  proof_image_url: string | null
  created_at: string
}

export type Vote = {
  id: string
  submission_id: string
  voter_user_id: string
  is_valid: boolean
  created_at: string
}

export type Proposal = {
  id: string
  group_id: string
  proposer_user_id: string
  target_user_id: string
  content: string
  vote_count: number
  is_approved: boolean
  created_at: string
}

export type Suggestion = {
  id: string
  group_id: string
  target_user_id: string
  content: string
  is_available: boolean
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Insert types (création de nouvelles lignes)
// ─────────────────────────────────────────────────────────────

export type GroupInsert = {
  id?: string
  name: string
  invite_code: string
  created_at?: string
  reveal_at?: string | null
  grid_size?: number
  duration_days?: number
}

export type UserInsert = {
  id?: string
  group_id: string
  username: string
  avatar_url?: string | null
  onboarding_answers?: Json | null
  created_at?: string
}

export type GridInsert = {
  id?: string
  owner_user_id: string
  group_id: string
  week_start: string
  is_revealed?: boolean
  created_at?: string
}

export type CellInsert = {
  id?: string
  grid_id: string
  target_user_id: string
  content?: string | null
  position?: number
  status?: string
  is_auto_generated?: boolean
  created_at?: string
}

export type SubmissionInsert = {
  id?: string
  cell_id: string
  submitter_user_id: string
  proof_text?: string | null
  proof_image_url?: string | null
  created_at?: string
}

export type VoteInsert = {
  id?: string
  submission_id: string
  voter_user_id: string
  is_valid: boolean
  created_at?: string
}

export type ProposalInsert = {
  id?: string
  group_id: string
  proposer_user_id: string
  target_user_id: string
  content: string
  vote_count?: number
  is_approved?: boolean
  created_at?: string
}

export type SuggestionInsert = {
  id?: string
  group_id: string
  target_user_id: string
  content: string
  is_available?: boolean
  created_at?: string
}

// ─────────────────────────────────────────────────────────────
// Update types (mise à jour partielle)
// ─────────────────────────────────────────────────────────────

export type GroupUpdate = Partial<GroupInsert>
export type UserUpdate = Partial<UserInsert>
export type GridUpdate = Partial<GridInsert>
export type CellUpdate = Partial<CellInsert>
export type SubmissionUpdate = Partial<SubmissionInsert>
export type VoteUpdate = Partial<VoteInsert>
export type ProposalUpdate = Partial<ProposalInsert>
export type SuggestionUpdate = Partial<SuggestionInsert>

// ─────────────────────────────────────────────────────────────
// Table definitions (utilisés par createClient<Database>)
// ─────────────────────────────────────────────────────────────

type GroupsTable = {
  Row: Group
  Insert: GroupInsert
  Update: GroupUpdate
  Relationships: []
}

type UsersTable = {
  Row: User
  Insert: UserInsert
  Update: UserUpdate
  Relationships: [
    {
      foreignKeyName: 'users_group_id_fkey'
      columns: ['group_id']
      referencedRelation: 'groups'
      referencedColumns: ['id']
    }
  ]
}

type GridsTable = {
  Row: Grid
  Insert: GridInsert
  Update: GridUpdate
  Relationships: [
    {
      foreignKeyName: 'grids_owner_user_id_fkey'
      columns: ['owner_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'grids_group_id_fkey'
      columns: ['group_id']
      referencedRelation: 'groups'
      referencedColumns: ['id']
    }
  ]
}

type CellsTable = {
  Row: Cell
  Insert: CellInsert
  Update: CellUpdate
  Relationships: [
    {
      foreignKeyName: 'cells_grid_id_fkey'
      columns: ['grid_id']
      referencedRelation: 'grids'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'cells_target_user_id_fkey'
      columns: ['target_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    }
  ]
}

type SubmissionsTable = {
  Row: Submission
  Insert: SubmissionInsert
  Update: SubmissionUpdate
  Relationships: [
    {
      foreignKeyName: 'submissions_cell_id_fkey'
      columns: ['cell_id']
      referencedRelation: 'cells'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'submissions_submitter_user_id_fkey'
      columns: ['submitter_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    }
  ]
}

type VotesTable = {
  Row: Vote
  Insert: VoteInsert
  Update: VoteUpdate
  Relationships: [
    {
      foreignKeyName: 'votes_submission_id_fkey'
      columns: ['submission_id']
      referencedRelation: 'submissions'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'votes_voter_user_id_fkey'
      columns: ['voter_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    }
  ]
}

type ProposalsTable = {
  Row: Proposal
  Insert: ProposalInsert
  Update: ProposalUpdate
  Relationships: [
    {
      foreignKeyName: 'proposals_group_id_fkey'
      columns: ['group_id']
      referencedRelation: 'groups'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'proposals_proposer_user_id_fkey'
      columns: ['proposer_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'proposals_target_user_id_fkey'
      columns: ['target_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    }
  ]
}

type SuggestionsTable = {
  Row: Suggestion
  Insert: SuggestionInsert
  Update: SuggestionUpdate
  Relationships: [
    {
      foreignKeyName: 'suggestions_group_id_fkey'
      columns: ['group_id']
      referencedRelation: 'groups'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'suggestions_target_user_id_fkey'
      columns: ['target_user_id']
      referencedRelation: 'users'
      referencedColumns: ['id']
    }
  ]
}
