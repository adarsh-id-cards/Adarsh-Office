/**
 * TypeScript interfaces for Phase 2 Client Management.
 */

export interface ClientRecord {
  id: string;
  name: string;
  normalized_name: string;
  is_archived: boolean;
  archived_at: string | null;
  archive_reason: string;
  order_count: number;
  original_order_count: number;
  replacement_order_count: number;
  last_order_date: string | null;
  total_original_ordered_quantity: number;
  total_replacement_ordered_quantity: number;
  total_ordered_quantity: number;
  total_dispatched_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface CreateClientPayload {
  name: string;
}

export interface UpdateClientPayload {
  name?: string;
  is_archived?: boolean;
  archive_reason?: string;
}
