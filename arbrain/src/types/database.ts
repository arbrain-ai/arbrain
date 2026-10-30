// ============================================================
// Auto-generated Supabase types + Domain types
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          email: string | null
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          email?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          email?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: string
          name: string
          role: string
          status: string
          level: string
          avatar: string
          current_task_id: string | null
          session_key: string | null
          system_prompt: string | null
          character: string | null
          lore: string | null
          user_id: string | null
          tenant_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          role?: string
          status?: string
          level?: string
          avatar?: string
          current_task_id?: string | null
          session_key?: string | null
          system_prompt?: string | null
          character?: string | null
          lore?: string | null
          user_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          role?: string
          status?: string
          level?: string
          avatar?: string
          current_task_id?: string | null
          session_key?: string | null
          system_prompt?: string | null
          character?: string | null
          lore?: string | null
          user_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'fk_agents_current_task'
            columns: ['current_task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          }
        ]
      }
      tasks: {
        Row: {
          id: string
          sequence_number: number
          title: string
          description: string
          status: string
          priority: number
          tags: string[] | null
          border_color: string | null
          session_key: string | null
          openclaw_run_id: string | null
          started_at: string | null
          due_at: string | null
          estimate: number | null
          parent_task_id: string | null
          position: number
          used_coding_tools: boolean | null
          tenant_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          sequence_number?: number
          title: string
          description?: string
          status?: string
          priority?: number
          tags?: string[] | null
          border_color?: string | null
          session_key?: string | null
          openclaw_run_id?: string | null
          started_at?: string | null
          due_at?: string | null
          estimate?: number | null
          parent_task_id?: string | null
          position?: number
          used_coding_tools?: boolean | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          sequence_number?: number
          title?: string
          description?: string
          status?: string
          priority?: number
          tags?: string[] | null
          border_color?: string | null
          session_key?: string | null
          openclaw_run_id?: string | null
          started_at?: string | null
          due_at?: string | null
          estimate?: number | null
          parent_task_id?: string | null
          position?: number
          used_coding_tools?: boolean | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          id: string
          task_id: string
          agent_id: string | null
          profile_id: string | null
          assigned_at: string | null
        }
        Insert: {
          id?: string
          task_id: string
          agent_id?: string | null
          profile_id?: string | null
          assigned_at?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          agent_id?: string | null
          profile_id?: string | null
          assigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'task_assignees_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_assignees_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          }
        ]
      }
      documents: {
        Row: {
          id: string
          title: string
          content: string
          type: string
          path: string | null
          task_id: string | null
          created_by_agent_id: string | null
          tenant_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          content?: string
          type: string
          path?: string | null
          task_id?: string | null
          created_by_agent_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          content?: string
          type?: string
          path?: string | null
          task_id?: string | null
          created_by_agent_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'documents_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'documents_created_by_agent_id_fkey'
            columns: ['created_by_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          }
        ]
      }
      messages: {
        Row: {
          id: string
          task_id: string
          from_agent_id: string
          content: string
          tenant_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          task_id: string
          from_agent_id: string
          content: string
          tenant_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          from_agent_id?: string
          content?: string
          tenant_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_from_agent_id_fkey'
            columns: ['from_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          }
        ]
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          document_id: string
        }
        Insert: {
          id?: string
          message_id: string
          document_id: string
        }
        Update: {
          id?: string
          message_id?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_attachments_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_attachments_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'documents'
            referencedColumns: ['id']
          }
        ]
      }
      activities: {
        Row: {
          id: string
          type: string
          agent_id: string
          message: string
          target_id: string | null
          tenant_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          type: string
          agent_id: string
          message: string
          target_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          type?: string
          agent_id?: string
          message?: string
          target_id?: string | null
          tenant_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'activities_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_target_id_fkey'
            columns: ['target_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          mentioned_agent_id: string
          content: string
          delivered: boolean | null
          tenant_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          mentioned_agent_id: string
          content: string
          delivered?: boolean | null
          tenant_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          mentioned_agent_id?: string
          content?: string
          delivered?: boolean | null
          tenant_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_mentioned_agent_id_fkey'
            columns: ['mentioned_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// ============================================================
// Domain Types (clean interfaces for app usage)
// ============================================================

export type UserRole = 'owner' | 'admin' | 'member'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export type AgentStatus = 'idle' | 'active' | 'blocked'
export type AgentLevel = 'LEAD' | 'INT' | 'SPC'
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'archived'
export type TaskPriority = 0 | 1 | 2 | 3 | 4 // 0=none, 1=urgent, 2=high, 3=medium, 4=low
export type ActivityType = 'status_update' | 'assignees_update' | 'task_update' | 'message' | 'document_created'
export type DocumentType = 'markdown' | 'code' | 'image' | 'note' | 'link' | 'spec'
export type TaskRelationType = 'blocks' | 'blocked_by' | 'related' | 'duplicate'

export interface Agent {
  id: string
  name: string
  role: string
  status: AgentStatus
  level: AgentLevel
  avatar: string
  current_task_id: string | null
  session_key: string | null
  system_prompt: string | null
  character: string | null
  lore: string | null
  user_id: string | null
  tenant_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Task {
  id: string
  sequence_number: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  tags: string[] | null
  border_color: string | null
  session_key: string | null
  openclaw_run_id: string | null
  started_at: string | null
  due_at: string | null
  estimate: number | null
  parent_task_id: string | null
  position: number
  used_coding_tools: boolean | null
  tenant_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Label {
  id: string
  name: string
  color: string
  tenant_id: string | null
  created_at: string | null
}

export interface TaskRelation {
  id: string
  source_task_id: string
  target_task_id: string
  relation_type: TaskRelationType
  created_at: string | null
}

export interface SavedView {
  id: string
  name: string
  filters: Record<string, unknown>
  sort_by: string | null
  sort_dir: string | null
  created_by_agent_id: string | null
  tenant_id: string | null
  created_at: string | null
}

export interface TaskWithAssignees extends Task {
  assignees: Profile[]
  labels?: Label[]
  subtasks?: Task[]
  messages_count?: number
  last_message_at?: string | null
}

export interface Document {
  id: string
  title: string
  content: string
  type: DocumentType
  path: string | null
  task_id: string | null
  created_by_agent_id: string | null
  tenant_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface Message {
  id: string
  task_id: string
  from_agent_id: string
  content: string
  tenant_id: string | null
  created_at: string | null
  agent?: Agent
}

export interface Activity {
  id: string
  type: ActivityType
  agent_id: string
  message: string
  target_id: string | null
  tenant_id: string | null
  created_at: string | null
  agent?: Agent
  task?: Task | null
}

export interface Notification {
  id: string
  mentioned_agent_id: string
  content: string
  delivered: boolean | null
  tenant_id: string | null
  created_at: string | null
}

export interface ChatSession {
  id: string
  title: string
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  metadata?: { source?: string; jobId?: string; jobLabel?: string } | null
}

export type ConversationStatus = 'pending' | 'done' | 'error'

export interface Conversation {
  id: string
  run_id: string
  agent_id: string | null
  prompt: string
  response: string | null
  source: string
  error: string | null
  status: ConversationStatus
  started_at: string
  ended_at: string | null
  created_at: string
  agents?: Agent
}

// Supabase helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
