export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string
          checksum: string | null
          name: string
        }
        Insert: {
          applied_at?: string
          checksum?: string | null
          name: string
        }
        Update: {
          applied_at?: string
          checksum?: string | null
          name?: string
        }
        Relationships: []
      }
      agent_commands: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_at: string | null
          delivery_attempts: number
          done_at: string | null
          id: string
          instance: string | null
          payload: Json
          result: string | null
          sent_at: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_at?: string | null
          delivery_attempts?: number
          done_at?: string | null
          id?: string
          instance?: string | null
          payload?: Json
          result?: string | null
          sent_at?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_at?: string | null
          delivery_attempts?: number
          done_at?: string | null
          id?: string
          instance?: string | null
          payload?: Json
          result?: string | null
          sent_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_commands_instance_fkey"
            columns: ["instance"]
            isOneToOne: false
            referencedRelation: "server_instances"
            referencedColumns: ["name"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          id: string
          match_id: string
          opened_by: string
          reason: string
          result_after: Json | null
          result_before: Json | null
          status: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          id?: string
          match_id: string
          opened_by: string
          reason: string
          result_after?: Json | null
          result_before?: Json | null
          status?: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          id?: string
          match_id?: string
          opened_by?: string
          reason?: string
          result_after?: Json | null
          result_before?: Json | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      finder_posts: {
        Row: {
          active: boolean
          availability: string | null
          created_at: string
          expires_at: string
          id: string
          kind: string
          modes: string[]
          note: string | null
          player_id: string
          roles: string[]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          modes?: string[]
          note?: string | null
          player_id: string
          roles?: string[]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          modes?: string[]
          note?: string | null
          player_id?: string
          roles?: string[]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finder_posts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finder_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_dedupe: {
        Row: {
          completed_at: string | null
          created_at: string
          key: string
          lease_token: string | null
          lease_until: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          key: string
          lease_token?: string | null
          lease_until?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          key?: string
          lease_token?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      lobbies: {
        Row: {
          bots: Json
          closed_at: string | null
          code: string
          created_at: string
          current_game_id: string | null
          draft: Json | null
          host_id: string
          id: string
          invite_token: string
          password_hash: string | null
          ready_check_until: string | null
          settings: Json
          status: string
          team1_name: string
          team2_name: string
          updated_at: string
          visibility: string
        }
        Insert: {
          bots?: Json
          closed_at?: string | null
          code: string
          created_at?: string
          current_game_id?: string | null
          draft?: Json | null
          host_id: string
          id?: string
          invite_token: string
          password_hash?: string | null
          ready_check_until?: string | null
          settings?: Json
          status?: string
          team1_name?: string
          team2_name?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          bots?: Json
          closed_at?: string | null
          code?: string
          created_at?: string
          current_game_id?: string | null
          draft?: Json | null
          host_id?: string
          id?: string
          invite_token?: string
          password_hash?: string | null
          ready_check_until?: string | null
          settings?: Json
          status?: string
          team1_name?: string
          team2_name?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_current_game_fkey"
            columns: ["current_game_id"]
            isOneToOne: false
            referencedRelation: "lobby_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobbies_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_bans: {
        Row: {
          created_at: string
          lobby_id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          lobby_id: string
          player_id: string
        }
        Update: {
          created_at?: string
          lobby_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_bans_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_bans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_games: {
        Row: {
          best_of: number
          created_at: string
          finished_at: string | null
          id: string
          lobby_id: string
          maps: Json
          matchzy_id: number
          note: string | null
          server_address: string | null
          server_assigned_at: string | null
          server_instance: string | null
          server_ready_at: string | null
          server_state: string | null
          settings: Json
          started_at: string | null
          status: string
          team1: Json
          team1_score: number
          team2: Json
          team2_score: number
          veto: Json
          veto_deadline: string | null
          veto_pool: string[]
          winner: number | null
        }
        Insert: {
          best_of?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          lobby_id: string
          maps?: Json
          matchzy_id?: number
          note?: string | null
          server_address?: string | null
          server_assigned_at?: string | null
          server_instance?: string | null
          server_ready_at?: string | null
          server_state?: string | null
          settings: Json
          started_at?: string | null
          status?: string
          team1: Json
          team1_score?: number
          team2: Json
          team2_score?: number
          veto?: Json
          veto_deadline?: string | null
          veto_pool?: string[]
          winner?: number | null
        }
        Update: {
          best_of?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          lobby_id?: string
          maps?: Json
          matchzy_id?: number
          note?: string | null
          server_address?: string | null
          server_assigned_at?: string | null
          server_instance?: string | null
          server_ready_at?: string | null
          server_state?: string | null
          settings?: Json
          started_at?: string | null
          status?: string
          team1?: Json
          team1_score?: number
          team2?: Json
          team2_score?: number
          veto?: Json
          veto_deadline?: string | null
          veto_pool?: string[]
          winner?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lobby_games_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_games_server_instance_fkey"
            columns: ["server_instance"]
            isOneToOne: false
            referencedRelation: "server_instances"
            referencedColumns: ["name"]
          },
        ]
      }
      lobby_members: {
        Row: {
          joined_at: string
          last_seen_at: string
          lobby_id: string
          player_id: string
          ready: boolean
          slot: string
        }
        Insert: {
          joined_at?: string
          last_seen_at?: string
          lobby_id: string
          player_id: string
          ready?: boolean
          slot?: string
        }
        Update: {
          joined_at?: string
          last_seen_at?: string
          lobby_id?: string
          player_id?: string
          ready?: boolean
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_members_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          lobby_id: string
          player_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          lobby_id: string
          player_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          lobby_id?: string
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lobby_messages_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_player_stats: {
        Row: {
          assists: number
          clutch_wins: number
          damage: number
          deaths: number
          first_kills: number
          game_id: string
          headshot_kills: number
          kast: number
          kills: number
          map_number: number
          mvp: number
          name: string | null
          player_id: string | null
          raw: Json
          rounds_played: number
          steam_id: string
          team: number
          updated_at: string
        }
        Insert: {
          assists?: number
          clutch_wins?: number
          damage?: number
          deaths?: number
          first_kills?: number
          game_id: string
          headshot_kills?: number
          kast?: number
          kills?: number
          map_number: number
          mvp?: number
          name?: string | null
          player_id?: string | null
          raw?: Json
          rounds_played?: number
          steam_id: string
          team: number
          updated_at?: string
        }
        Update: {
          assists?: number
          clutch_wins?: number
          damage?: number
          deaths?: number
          first_kills?: number
          game_id?: string
          headshot_kills?: number
          kast?: number
          kills?: number
          map_number?: number
          mvp?: number
          name?: string | null
          player_id?: string | null
          raw?: Json
          rounds_played?: number
          steam_id?: string
          team?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_player_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "lobby_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          player_id: string
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          player_id: string
          settings: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          player_id?: string
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lobby_templates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          event: string
          id: number
          map_number: number | null
          match_id: string | null
          matchzy_id: number | null
          payload: Json
          received_at: string
          round_number: number | null
        }
        Insert: {
          event: string
          id?: never
          map_number?: number | null
          match_id?: string | null
          matchzy_id?: number | null
          payload: Json
          received_at?: string
          round_number?: number | null
        }
        Update: {
          event?: string
          id?: never
          map_number?: number | null
          match_id?: string | null
          matchzy_id?: number | null
          payload?: Json
          received_at?: string
          round_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_log_state: {
        Row: {
          buffer: Json
          live: boolean
          map_number: number
          match_id: string
          revision: number
          roster: Json
          round_number: number
          updated_at: string
        }
        Insert: {
          buffer?: Json
          live?: boolean
          map_number?: number
          match_id: string
          revision?: number
          roster?: Json
          round_number?: number
          updated_at?: string
        }
        Update: {
          buffer?: Json
          live?: boolean
          map_number?: number
          match_id?: string
          revision?: number
          roster?: Json
          round_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_log_state_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_maps: {
        Row: {
          id: string
          map_name: string
          map_number: number
          match_id: string
          picked_by: string | null
          status: string
          team1_score: number
          team2_score: number
          winner_id: string | null
        }
        Insert: {
          id?: string
          map_name: string
          map_number: number
          match_id: string
          picked_by?: string | null
          status?: string
          team1_score?: number
          team2_score?: number
          winner_id?: string | null
        }
        Update: {
          id?: string
          map_name?: string
          map_number?: number
          match_id?: string
          picked_by?: string | null
          status?: string
          team1_score?: number
          team2_score?: number
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_maps_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_maps_picked_by_fkey"
            columns: ["picked_by"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_maps_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_rounds: {
        Row: {
          created_at: string
          events: Json
          map_number: number
          match_id: string
          model: string
          round_number: number
          swing: Json
          winner_side: string | null
        }
        Insert: {
          created_at?: string
          events: Json
          map_number: number
          match_id: string
          model?: string
          round_number: number
          swing: Json
          winner_side?: string | null
        }
        Update: {
          created_at?: string
          events?: Json
          map_number?: number
          match_id?: string
          model?: string
          round_number?: number
          swing?: Json
          winner_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_rounds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          best_of: number
          bracket: Database["public"]["Enums"]["bracket_side"]
          created_at: string
          finished_at: string | null
          group_label: string | null
          id: string
          is_walkover: boolean
          loser_to_match: string | null
          loser_to_slot: number | null
          matchzy_id: number
          number: number
          position: number
          round: number
          scheduled_at: string | null
          server_address: string | null
          server_assigned_at: string | null
          server_instance: string | null
          server_password: string | null
          server_ready_at: string | null
          server_state: string | null
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          team1_id: string | null
          team1_score: number
          team2_id: string | null
          team2_score: number
          tournament_id: string
          under_review: boolean
          veto_deadline: string | null
          winner_id: string | null
          winner_to_match: string | null
          winner_to_slot: number | null
        }
        Insert: {
          best_of?: number
          bracket: Database["public"]["Enums"]["bracket_side"]
          created_at?: string
          finished_at?: string | null
          group_label?: string | null
          id?: string
          is_walkover?: boolean
          loser_to_match?: string | null
          loser_to_slot?: number | null
          matchzy_id?: number
          number: number
          position: number
          round: number
          scheduled_at?: string | null
          server_address?: string | null
          server_assigned_at?: string | null
          server_instance?: string | null
          server_password?: string | null
          server_ready_at?: string | null
          server_state?: string | null
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team1_id?: string | null
          team1_score?: number
          team2_id?: string | null
          team2_score?: number
          tournament_id: string
          under_review?: boolean
          veto_deadline?: string | null
          winner_id?: string | null
          winner_to_match?: string | null
          winner_to_slot?: number | null
        }
        Update: {
          best_of?: number
          bracket?: Database["public"]["Enums"]["bracket_side"]
          created_at?: string
          finished_at?: string | null
          group_label?: string | null
          id?: string
          is_walkover?: boolean
          loser_to_match?: string | null
          loser_to_slot?: number | null
          matchzy_id?: number
          number?: number
          position?: number
          round?: number
          scheduled_at?: string | null
          server_address?: string | null
          server_assigned_at?: string | null
          server_instance?: string | null
          server_password?: string | null
          server_ready_at?: string | null
          server_state?: string | null
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team1_id?: string | null
          team1_score?: number
          team2_id?: string | null
          team2_score?: number
          tournament_id?: string
          under_review?: boolean
          veto_deadline?: string | null
          winner_id?: string | null
          winner_to_match?: string | null
          winner_to_slot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_loser_to_match_fkey"
            columns: ["loser_to_match"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_server_instance_fkey"
            columns: ["server_instance"]
            isOneToOne: false
            referencedRelation: "server_instances"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_to_match_fkey"
            columns: ["winner_to_match"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          player_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          player_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          player_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_map_stats: {
        Row: {
          assists: number
          bomb_defuses: number
          bomb_plants: number
          clutch_wins: number
          damage: number
          deaths: number
          enemies_flashed: number
          first_deaths: number
          first_kills: number
          flash_assists: number
          headshot_kills: number
          kast: number
          kills: number
          map_number: number
          match_id: string
          multi_kills: Json
          mvp: number
          name: string | null
          player_id: string | null
          raw: Json
          rounds_played: number
          steam_id: string
          team_id: string | null
          trade_kills: number
          updated_at: string
          utility_damage: number
        }
        Insert: {
          assists?: number
          bomb_defuses?: number
          bomb_plants?: number
          clutch_wins?: number
          damage?: number
          deaths?: number
          enemies_flashed?: number
          first_deaths?: number
          first_kills?: number
          flash_assists?: number
          headshot_kills?: number
          kast?: number
          kills?: number
          map_number: number
          match_id: string
          multi_kills?: Json
          mvp?: number
          name?: string | null
          player_id?: string | null
          raw?: Json
          rounds_played?: number
          steam_id: string
          team_id?: string | null
          trade_kills?: number
          updated_at?: string
          utility_damage?: number
        }
        Update: {
          assists?: number
          bomb_defuses?: number
          bomb_plants?: number
          clutch_wins?: number
          damage?: number
          deaths?: number
          enemies_flashed?: number
          first_deaths?: number
          first_kills?: number
          flash_assists?: number
          headshot_kills?: number
          kast?: number
          kills?: number
          map_number?: number
          match_id?: string
          multi_kills?: Json
          mvp?: number
          name?: string | null
          player_id?: string | null
          raw?: Json
          rounds_played?: number
          steam_id?: string
          team_id?: string | null
          trade_kills?: number
          updated_at?: string
          utility_damage?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_map_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_map_swing: {
        Row: {
          map_number: number
          match_id: string
          rounds: number
          steam_id: string
          swing_sum: number
        }
        Insert: {
          map_number: number
          match_id: string
          rounds?: number
          steam_id: string
          swing_sum?: number
        }
        Update: {
          map_number?: number
          match_id?: string
          rounds?: number
          steam_id?: string
          swing_sum?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_map_swing_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          birth_date: string | null
          city: string | null
          consent_at: string | null
          consent_version: string | null
          course: string | null
          created_at: string
          first_name: string | null
          last_name: string | null
          occupation: string | null
          organization: string | null
          patronymic: string | null
          phone: string | null
          player_id: string
          position: string | null
          prompted_at: string | null
          study_group: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          birth_date?: string | null
          city?: string | null
          consent_at?: string | null
          consent_version?: string | null
          course?: string | null
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          occupation?: string | null
          organization?: string | null
          patronymic?: string | null
          phone?: string | null
          player_id: string
          position?: string | null
          prompted_at?: string | null
          study_group?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          birth_date?: string | null
          city?: string | null
          consent_at?: string | null
          consent_version?: string | null
          course?: string | null
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          occupation?: string | null
          organization?: string | null
          patronymic?: string | null
          phone?: string | null
          player_id?: string
          position?: string | null
          prompted_at?: string | null
          study_group?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          faceit_elo: number | null
          faceit_id: string | null
          faceit_level: number | null
          faceit_nickname: string | null
          faceit_updated_at: string | null
          id: string
          is_admin: boolean
          is_banned: boolean
          last_login_at: string | null
          nickname: string
          profile_refreshed_at: string | null
          profile_url: string | null
          steam_id: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          faceit_elo?: number | null
          faceit_id?: string | null
          faceit_level?: number | null
          faceit_nickname?: string | null
          faceit_updated_at?: string | null
          id?: string
          is_admin?: boolean
          is_banned?: boolean
          last_login_at?: string | null
          nickname: string
          profile_refreshed_at?: string | null
          profile_url?: string | null
          steam_id: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          faceit_elo?: number | null
          faceit_id?: string | null
          faceit_level?: number | null
          faceit_nickname?: string | null
          faceit_updated_at?: string | null
          id?: string
          is_admin?: boolean
          is_banned?: boolean
          last_login_at?: string | null
          nickname?: string
          profile_refreshed_at?: string | null
          profile_url?: string | null
          steam_id?: string
        }
        Relationships: []
      }
      rate_limit_claims: {
        Row: {
          action: string
          actor_id: string
          claimed_at: string
        }
        Insert: {
          action: string
          actor_id: string
          claimed_at?: string
        }
        Update: {
          action?: string
          actor_id?: string
          claimed_at?: string
        }
        Relationships: []
      }
      roster_changes: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          match_id: string | null
          player_in: string | null
          player_out: string | null
          reason: string | null
          team_id: string
          tournament_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          player_in?: string | null
          player_out?: string | null
          reason?: string | null
          team_id: string
          tournament_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          player_in?: string | null
          player_out?: string | null
          reason?: string | null
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_changes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_changes_player_in_fkey"
            columns: ["player_in"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_changes_player_out_fkey"
            columns: ["player_out"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_changes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_changes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      server_host: {
        Row: {
          id: string
          info: Json
          lan_ip: string | null
          last_seen_at: string | null
        }
        Insert: {
          id?: string
          info?: Json
          lan_ip?: string | null
          last_seen_at?: string | null
        }
        Update: {
          id?: string
          info?: Json
          lan_ip?: string | null
          last_seen_at?: string | null
        }
        Relationships: []
      }
      server_instances: {
        Row: {
          for_lobby: boolean
          gamestate: string | null
          info: Json
          last_seen_at: string | null
          map: string | null
          match_id: string | null
          matchzy_match_id: number | null
          name: string
          players: number | null
          port: number
          role: string
          running: boolean
        }
        Insert: {
          for_lobby?: boolean
          gamestate?: string | null
          info?: Json
          last_seen_at?: string | null
          map?: string | null
          match_id?: string | null
          matchzy_match_id?: number | null
          name: string
          players?: number | null
          port: number
          role?: string
          running?: boolean
        }
        Update: {
          for_lobby?: boolean
          gamestate?: string | null
          info?: Json
          last_seen_at?: string | null
          map?: string | null
          match_id?: string | null
          matchzy_match_id?: number | null
          name?: string
          players?: number | null
          port?: number
          role?: string
          running?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "server_instances_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      team_applications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          player_id: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          player_id: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          player_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_applications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          is_solo: boolean
          joined_at: string
          left_at: string | null
          player_id: string
          role: Database["public"]["Enums"]["member_role"]
          team_id: string
        }
        Insert: {
          id?: string
          is_solo?: boolean
          joined_at?: string
          left_at?: string | null
          player_id: string
          role?: Database["public"]["Enums"]["member_role"]
          team_id: string
        }
        Update: {
          id?: string
          is_solo?: boolean
          joined_at?: string
          left_at?: string | null
          player_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_tag_aliases: {
        Row: {
          created_at: string
          tag: string
          team_id: string
        }
        Insert: {
          created_at?: string
          tag: string
          team_id: string
        }
        Update: {
          created_at?: string
          tag?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_tag_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          accepts_applications: boolean
          captain_id: string
          created_at: string
          description: string | null
          disbanded_at: string | null
          id: string
          invite_code: string
          is_solo: boolean
          logo_url: string | null
          name: string
          region: string | null
          tag: string
        }
        Insert: {
          accepts_applications?: boolean
          captain_id: string
          created_at?: string
          description?: string | null
          disbanded_at?: string | null
          id?: string
          invite_code: string
          is_solo?: boolean
          logo_url?: string | null
          name: string
          region?: string | null
          tag: string
        }
        Update: {
          accepts_applications?: boolean
          captain_id?: string
          created_at?: string
          description?: string | null
          disbanded_at?: string | null
          id?: string
          invite_code?: string
          is_solo?: boolean
          logo_url?: string | null
          name?: string
          region?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_applications: {
        Row: {
          captain_phone: string | null
          coach_birth_date: string | null
          coach_documents_at: string | null
          coach_documents_by: string | null
          coach_name: string | null
          coach_position: string | null
          coach_workplace: string | null
          created_at: string
          organization: string
          registration_id: string
          responsible_name: string | null
          responsible_phone: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          captain_phone?: string | null
          coach_birth_date?: string | null
          coach_documents_at?: string | null
          coach_documents_by?: string | null
          coach_name?: string | null
          coach_position?: string | null
          coach_workplace?: string | null
          created_at?: string
          organization: string
          registration_id: string
          responsible_name?: string | null
          responsible_phone?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          captain_phone?: string | null
          coach_birth_date?: string | null
          coach_documents_at?: string | null
          coach_documents_by?: string | null
          coach_name?: string | null
          coach_position?: string | null
          coach_workplace?: string | null
          created_at?: string
          organization?: string
          registration_id?: string
          responsible_name?: string | null
          responsible_phone?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_applications_coach_documents_by_fkey"
            columns: ["coach_documents_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_applications_registration_fkey"
            columns: ["registration_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "tournament_applications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_nominations: {
        Row: {
          decided_at: string
          decided_by: string | null
          key: string
          name: string | null
          note: string | null
          player_id: string | null
          team_id: string | null
          tournament_id: string
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          key: string
          name?: string | null
          note?: string | null
          player_id?: string | null
          team_id?: string | null
          tournament_id: string
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          key?: string
          name?: string | null
          note?: string | null
          player_id?: string | null
          team_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_nominations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_nominations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_nominations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_nominations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_participant_documents: {
        Row: {
          marked_by: string | null
          player_id: string
          submitted_at: string
          tournament_id: string
        }
        Insert: {
          marked_by?: string | null
          player_id: string
          submitted_at?: string
          tournament_id: string
        }
        Update: {
          marked_by?: string | null
          player_id?: string
          submitted_at?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participant_documents_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participant_documents_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participant_documents_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          seed: number | null
          status: Database["public"]["Enums"]["registration_status"]
          team_id: string
          tournament_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          seed?: number | null
          status?: Database["public"]["Enums"]["registration_status"]
          team_id: string
          tournament_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          seed?: number | null
          status?: Database["public"]["Enums"]["registration_status"]
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_roster_players: {
        Row: {
          created_at: string
          id: string
          player_id: string
          registration_id: string
          role: Database["public"]["Enums"]["roster_role"]
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          registration_id: string
          role?: Database["public"]["Enums"]["roster_role"]
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          registration_id?: string
          role?: Database["public"]["Enums"]["roster_role"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_roster_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_roster_players_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_roster_players_registration_tournament_fkey"
            columns: ["registration_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id", "tournament_id"]
          },
          {
            foreignKeyName: "tournament_roster_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          advance_per_group: number
          allow_substitutes: boolean
          auto_approve: boolean
          autopilot: boolean
          bracket_published_at: string | null
          bracket_type: string
          checkin_closes_at: string | null
          checkin_opens_at: string | null
          city: string
          contact: string | null
          cover_url: string | null
          created_at: string
          default_best_of: number
          description: string | null
          discord_url: string | null
          entry_fee: string | null
          final_best_of: number
          format: string
          game: string
          groups_count: number
          id: string
          is_lan: boolean
          is_official: boolean
          knife_round: boolean
          location: string | null
          map_pool: string[]
          match_format: string | null
          max_age: number
          max_teams: number
          min_age: number
          name: string
          overtime: boolean
          playoff_created_at: string | null
          playoff_type: string
          prize_distribution: Json
          prize_pool: string | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          require_coach: boolean
          requirements: string | null
          rules: string | null
          slug: string
          sponsors: Json
          starts_at: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          stream_url: string | null
          swiss_wins: number
          tech_pause_seconds: number
          tech_pauses: number
          third_place_match: boolean
          timeout_seconds: number
          timeouts_per_team: number
          updated_at: string
        }
        Insert: {
          advance_per_group?: number
          allow_substitutes?: boolean
          auto_approve?: boolean
          autopilot?: boolean
          bracket_published_at?: string | null
          bracket_type?: string
          checkin_closes_at?: string | null
          checkin_opens_at?: string | null
          city?: string
          contact?: string | null
          cover_url?: string | null
          created_at?: string
          default_best_of?: number
          description?: string | null
          discord_url?: string | null
          entry_fee?: string | null
          final_best_of?: number
          format?: string
          game?: string
          groups_count?: number
          id?: string
          is_lan?: boolean
          is_official?: boolean
          knife_round?: boolean
          location?: string | null
          map_pool?: string[]
          match_format?: string | null
          max_age?: number
          max_teams?: number
          min_age?: number
          name: string
          overtime?: boolean
          playoff_created_at?: string | null
          playoff_type?: string
          prize_distribution?: Json
          prize_pool?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          require_coach?: boolean
          requirements?: string | null
          rules?: string | null
          slug: string
          sponsors?: Json
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          stream_url?: string | null
          swiss_wins?: number
          tech_pause_seconds?: number
          tech_pauses?: number
          third_place_match?: boolean
          timeout_seconds?: number
          timeouts_per_team?: number
          updated_at?: string
        }
        Update: {
          advance_per_group?: number
          allow_substitutes?: boolean
          auto_approve?: boolean
          autopilot?: boolean
          bracket_published_at?: string | null
          bracket_type?: string
          checkin_closes_at?: string | null
          checkin_opens_at?: string | null
          city?: string
          contact?: string | null
          cover_url?: string | null
          created_at?: string
          default_best_of?: number
          description?: string | null
          discord_url?: string | null
          entry_fee?: string | null
          final_best_of?: number
          format?: string
          game?: string
          groups_count?: number
          id?: string
          is_lan?: boolean
          is_official?: boolean
          knife_round?: boolean
          location?: string | null
          map_pool?: string[]
          match_format?: string | null
          max_age?: number
          max_teams?: number
          min_age?: number
          name?: string
          overtime?: boolean
          playoff_created_at?: string | null
          playoff_type?: string
          prize_distribution?: Json
          prize_pool?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          require_coach?: boolean
          requirements?: string | null
          rules?: string | null
          slug?: string
          sponsors?: Json
          starts_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          stream_url?: string | null
          swiss_wins?: number
          tech_pause_seconds?: number
          tech_pauses?: number
          third_place_match?: boolean
          timeout_seconds?: number
          timeouts_per_team?: number
          updated_at?: string
        }
        Relationships: []
      }
      veto_actions: {
        Row: {
          action: string
          actor_id: string | null
          auto: boolean
          created_at: string
          id: string
          map_name: string
          match_id: string
          step: number
          team_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          auto?: boolean
          created_at?: string
          id?: string
          map_name: string
          match_id: string
          step: number
          team_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          auto?: boolean
          created_at?: string
          id?: string
          map_name?: string
          match_id?: string
          step?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veto_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veto_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veto_actions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_application: {
        Args: {
          p_actor: string
          p_application: string
          p_max_main: number
          p_max_subs: number
          p_ttl_days: number
        }
        Returns: string
      }
      apply_to_team: {
        Args: {
          p_cooldown_hours: number
          p_limit: number
          p_message: string
          p_player: string
          p_team: string
          p_ttl_days: number
        }
        Returns: string
      }
      assign_game_server: {
        Args: {
          p_actor?: string
          p_game: string
          p_instance: string
          p_lobby?: boolean
        }
        Returns: boolean
      }
      change_registration: {
        Args: {
          p_actor: string
          p_admin?: boolean
          p_note?: string
          p_registration: string
          p_status: Database["public"]["Enums"]["registration_status"]
        }
        Returns: boolean
      }
      check_in_registration: {
        Args: {
          p_actor: string
          p_admin?: boolean
          p_registration: string
          p_undo?: boolean
        }
        Returns: boolean
      }
      claim_agent_commands: {
        Args: { p_replay?: boolean }
        Returns: {
          created_at: string
          created_by: string | null
          delivery_at: string | null
          delivery_attempts: number
          done_at: string | null
          id: string
          instance: string | null
          payload: Json
          result: string | null
          sent_at: string | null
          status: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_commands"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ingest: { Args: { p_key: string }; Returns: Json }
      commit_log_batch: {
        Args: {
          p_buffer: Json
          p_key: string
          p_map: number
          p_match: string
          p_revision: number
          p_roster: Json
          p_rounds: Json
          p_token: string
        }
        Returns: undefined
      }
      create_stage_matches: {
        Args: { p_mode: string; p_rows: Json; p_tournament: string }
        Returns: boolean
      }
      finish_veto: {
        Args: { p_match: string; p_single_map?: string }
        Returns: boolean
      }
      join_team: {
        Args: {
          p_max_main: number
          p_max_subs: number
          p_player: string
          p_team: string
        }
        Returns: string
      }
      kick_team_member: {
        Args: { p_actor: string; p_member: string; p_team: string }
        Returns: string
      }
      player_profile_complete: {
        Args: { p: Database["public"]["Tables"]["player_profiles"]["Row"] }
        Returns: boolean
      }
      prune_old_rows: {
        Args: {
          p_audit_days?: number
          p_command_days?: number
          p_event_days?: number
        }
        Returns: Json
      }
      purge_official_application_data: {
        Args: { p_tournament: string }
        Returns: Json
      }
      rate_limit_claim: {
        Args: { p_action: string; p_actor: string; p_seconds: number }
        Returns: boolean
      }
      recompute_match_series: {
        Args: { p_advantage?: number; p_match: string }
        Returns: Json
      }
      save_match_map_score: {
        Args: {
          p_advantage?: number
          p_finish: boolean
          p_map: string
          p_match: string
          p_score1: number
          p_score2: number
        }
        Returns: Json
      }
      save_official_registration: {
        Args: {
          p_actor: string
          p_application: Json
          p_main: string[]
          p_sub: string[]
          p_team: string
          p_tournament: string
        }
        Returns: Json
      }
      save_registration: {
        Args: {
          p_actor: string
          p_main: string[]
          p_sub: string[]
          p_team: string
          p_tournament: string
        }
        Returns: Json
      }
      set_team_member_role: {
        Args: {
          p_actor: string
          p_max_main: number
          p_max_subs: number
          p_member: string
          p_role: string
          p_team: string
        }
        Returns: string
      }
      start_map_logging: {
        Args: { p_map: number; p_match: string }
        Returns: undefined
      }
      sync_bracket_apply: {
        Args: { p_expected: Json; p_tournament: string; p_updates: Json }
        Returns: Json
      }
      transfer_team_captain: {
        Args: { p_actor: string; p_member: string; p_team: string }
        Returns: string
      }
    }
    Enums: {
      bracket_side: "upper" | "lower" | "grand_final" | "group" | "swiss" | "third_place"
      match_status:
        | "pending"
        | "upcoming"
        | "veto"
        | "ready"
        | "live"
        | "finished"
        | "cancelled"
      member_role: "captain" | "player" | "substitute"
      registration_status: "pending" | "approved" | "rejected" | "withdrawn"
      roster_role: "main" | "sub"
      tournament_status:
        | "draft"
        | "registration"
        | "registration_closed"
        | "checkin"
        | "live"
        | "finished"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bracket_side: ["upper", "lower", "grand_final", "group", "swiss", "third_place"],
      match_status: [
        "pending",
        "upcoming",
        "veto",
        "ready",
        "live",
        "finished",
        "cancelled",
      ],
      member_role: ["captain", "player", "substitute"],
      registration_status: ["pending", "approved", "rejected", "withdrawn"],
      roster_role: ["main", "sub"],
      tournament_status: [
        "draft",
        "registration",
        "registration_closed",
        "checkin",
        "live",
        "finished",
        "cancelled",
      ],
    },
  },
} as const
