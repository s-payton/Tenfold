import type { Card } from '@tenfold/engine';
import type { RoomData } from '@tenfold/server';

/** The only tables a client can read (see supabase/migrations). Clients never write. */
export interface Database {
  public: {
    Tables: {
      room_states: {
        Row: { room_id: string; version: number; data: RoomData; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      hands: {
        Row: { room_id: string; player_id: string; user_id: string; version: number; cards: Card[] };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
