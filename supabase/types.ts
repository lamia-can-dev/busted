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

export interface Database {
  public: {
    Tables: {
      groups: GroupsTable
      users: UsersTable
      grids: GridsTable
      cells: CellsTable
      submissions: SubmissionsTable
      votes: VotesTable
      proposals: ProposalsTable
    }
    Views: Record<string, never>
    Functions: {
      current_user_group_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}

// ─────────────────────────────────────────────────────────────
// Row types (lecture depuis Supabase)
// ─────────────────────────────────────────────────────────────

export interface Group {
  id: string
  name: string
  invite_code: string
  created_at: string
  reveal_at: string | null
}

export interface User {
  id: string
  group_id: string
  username: string
  avatar_url: string | null
  onboarding_answers: Json | null
  created_at: string
}

export interface Grid {
  id: string
  owner_user_id: string
  group_id: string
  week_start: string        // date ISO (YYYY-MM-DD)
  is_revealed: boolean
  created_at: string
}

export interface Cell {
  id: string
  grid_id: string
  target_user_id: string
  content: string | null
  is_auto_generated: boolean
  created_at: string
}

export interface Submission {
  id: string
  cell_id: string
  submitter_user_id: string
  proof_text: string | null
  proof_image_url: string | null
  created_at: string
}

export interface Vote {
  id: string
  submission_id: string
  voter_user_id: string
  is_valid: boolean
  created_at: string
}

export interface Proposal {
  id: string
  group_id: string
  proposer_user_id: string
  target_user_id: string
  content: string
  vote_count: number
  is_approved: boolean
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Insert types (création de nouvelles lignes)
// ─────────────────────────────────────────────────────────────

export interface GroupInsert {
  id?: string
  name: string
  invite_code: string
  created_at?: string
  reveal_at?: string | null
}

export interface UserInsert {
  id?: string
  group_id: string
  username: string
  avatar_url?: string | null
  onboarding_answers?: Json | null
  created_at?: string
}

export interface GridInsert {
  id?: string
  owner_user_id: string
  group_id: string
  week_start: string
  is_revealed?: boolean
  created_at?: string
}

export interface CellInsert {
  id?: string
  grid_id: string
  target_user_id: string
  content?: string | null
  is_auto_generated?: boolean
  created_at?: string
}

export interface SubmissionInsert {
  id?: string
  cell_id: string
  submitter_user_id: string
  proof_text?: string | null
  proof_image_url?: string | null
  created_at?: string
}

export interface VoteInsert {
  id?: string
  submission_id: string
  voter_user_id: string
  is_valid: boolean
  created_at?: string
}

export interface ProposalInsert {
  id?: string
  group_id: string
  proposer_user_id: string
  target_user_id: string
  content: string
  vote_count?: number
  is_approved?: boolean
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

// ─────────────────────────────────────────────────────────────
// Table definitions (utilisés par createClient<Database>)
// ─────────────────────────────────────────────────────────────

interface GroupsTable {
  Row: Group
  Insert: GroupInsert
  Update: GroupUpdate
  Relationships: []
}

interface UsersTable {
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

interface GridsTable {
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

interface CellsTable {
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

interface SubmissionsTable {
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

interface VotesTable {
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

interface ProposalsTable {
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
