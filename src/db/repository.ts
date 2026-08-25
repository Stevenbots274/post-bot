import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type {
  ButtonDefinition,
  ContentType,
  Draft,
  DraftState,
  PublishTarget,
  TelegramUser,
  Template,
} from "../types/domain.js"

type Row = Record<string, any>

function mapDraft(row: Row): Draft {
  return {
    ...row,
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  } as Draft
}

function mapTemplate(row: Row): Template {
  return { ...row, buttons: Array.isArray(row.buttons) ? row.buttons : [] } as Template
}

export class Repository {
  private readonly db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  async upsertUser(user: TelegramUser): Promise<void> {
    const { error } = await this.db.from("users").upsert(
      {
        telegram_user_id: user.id,
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        language_code: user.language_code ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    )
    if (error) throw new Error(`user upsert failed: ${error.message}`)
  }

  async getDraft(userId: number): Promise<Draft | null> {
    const { data, error } = await this.db
      .from("drafts")
      .select("*")
      .eq("telegram_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`draft lookup failed: ${error.message}`)
    return data ? mapDraft(data) : null
  }

  async createDraft(userId: number, contentType: ContentType, state: DraftState): Promise<Draft> {
    const { data, error } = await this.db
      .from("drafts")
      .insert({ telegram_user_id: userId, content_type: contentType, state })
      .select("*")
      .single()
    if (error || !data) throw new Error(`draft creation failed: ${error?.message ?? "empty response"}`)
    return mapDraft(data)
  }

  async updateDraft(
    id: string,
    patch: Partial<Pick<Draft, "content_type" | "body" | "caption" | "telegram_file_id" | "telegram_file_unique_id" | "buttons" | "state" | "metadata">>,
  ): Promise<Draft> {
    const { data, error } = await this.db
      .from("drafts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single()
    if (error || !data) throw new Error(`draft update failed: ${error?.message ?? "empty response"}`)
    return mapDraft(data)
  }

  async deleteDraft(id: string): Promise<void> {
    const { error } = await this.db.from("drafts").delete().eq("id", id)
    if (error) throw new Error(`draft deletion failed: ${error.message}`)
  }

  async createPost(draft: Draft): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from("posts")
      .insert({
        // Reusing the draft UUID makes concurrent publish clicks converge on one post.
        id: draft.id,
        telegram_user_id: draft.telegram_user_id,
        content_type: draft.content_type,
        body: draft.body,
        caption: draft.caption,
        telegram_file_id: draft.telegram_file_id,
        buttons: draft.buttons,
        status: "publishing",
      })
      .select("id")
      .single()
    if (error?.code === "23505") return { id: draft.id }
    if (error || !data) throw new Error(`post creation failed: ${error?.message ?? "empty response"}`)
    return data as { id: string }
  }

  async updatePostStatus(postId: string, status: string): Promise<void> {
    const { error } = await this.db
      .from("posts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", postId)
    if (error) throw new Error(`post status update failed: ${error.message}`)
  }

  async claimPublication(postId: string, userId: number, chatId: number): Promise<{ id: string } | null> {
    const { data: existing, error: lookupError } = await this.db
      .from("publications")
      .select("id,status")
      .eq("post_id", postId)
      .eq("chat_id", chatId)
      .in("status", ["publishing", "published"])
      .maybeSingle()
    if (lookupError) throw new Error(`publication lookup failed: ${lookupError.message}`)
    if (existing) return null

    const { data, error } = await this.db
      .from("publications")
      .insert({ post_id: postId, telegram_user_id: userId, chat_id: chatId, status: "publishing" })
      .select("id")
      .single()
    if (error?.code === "23505") return null
    if (error || !data) throw new Error(`publication claim failed: ${error?.message ?? "empty response"}`)
    return data as { id: string }
  }

  async updatePublication(
    publicationId: string,
    patch: { status: string; telegram_message_id?: number; error_code?: string; error_message?: string },
  ): Promise<void> {
    const values = {
      ...patch,
      published_at: patch.status === "published" ? new Date().toISOString() : null,
    }
    const { error } = await this.db.from("publications").update(values).eq("id", publicationId)
    if (error) throw new Error(`publication update failed: ${error.message}`)
  }

  async listTargets(userId: number): Promise<PublishTarget[]> {
    const { data, error } = await this.db
      .from("publish_targets")
      .select("*")
      .eq("telegram_user_id", userId)
      .eq("can_post", true)
      .order("chat_title", { ascending: true })
    if (error) throw new Error(`target lookup failed: ${error.message}`)
    return (data ?? []) as PublishTarget[]
  }

  async getTarget(id: string, userId: number): Promise<PublishTarget | null> {
    const { data, error } = await this.db
      .from("publish_targets")
      .select("*")
      .eq("id", id)
      .eq("telegram_user_id", userId)
      .eq("can_post", true)
      .maybeSingle()
    if (error) throw new Error(`target lookup failed: ${error.message}`)
    return (data as PublishTarget | null) ?? null
  }

  async registerTarget(target: Omit<PublishTarget, "id">): Promise<void> {
    const { error } = await this.db.from("publish_targets").upsert(
      { ...target, updated_at: new Date().toISOString() },
      { onConflict: "telegram_user_id,chat_id" },
    )
    if (error) throw new Error(`target registration failed: ${error.message}`)
  }

  async listTemplates(userId: number): Promise<Template[]> {
    const { data, error } = await this.db
      .from("templates")
      .select("*")
      .eq("telegram_user_id", userId)
      .order("updated_at", { ascending: false })
    if (error) throw new Error(`template lookup failed: ${error.message}`)
    return (data ?? []).map(mapTemplate)
  }

  async getTemplate(id: string, userId: number): Promise<Template | null> {
    const { data, error } = await this.db
      .from("templates")
      .select("*")
      .eq("id", id)
      .eq("telegram_user_id", userId)
      .maybeSingle()
    if (error) throw new Error(`template lookup failed: ${error.message}`)
    return data ? mapTemplate(data) : null
  }

  async saveTemplate(input: Omit<Template, "id" | "is_public">): Promise<void> {
    const { error } = await this.db.from("templates").insert({ ...input, is_public: false })
    if (error) throw new Error(`template save failed: ${error.message}`)
  }

  async listPosts(userId: number): Promise<Array<{ id: string; content_type: ContentType; status: string; created_at: string }>> {
    const { data, error } = await this.db
      .from("posts")
      .select("id,content_type,status,created_at")
      .eq("telegram_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    return (data ?? []) as Array<{ id: string; content_type: ContentType; status: string; created_at: string }>
  }

  async claimUpdate(updateId: number): Promise<boolean> {
    const { error } = await this.db.from("processed_updates").insert({ update_id: updateId })
    if (error?.code === "23505") return false
    if (error) throw new Error(`update claim failed: ${error.message}`)
    return true
  }

  async releaseUpdate(updateId: number): Promise<void> {
    const { error } = await this.db.from("processed_updates").delete().eq("update_id", updateId)
    if (error) console.error("Could not release failed update", { updateId, error: error.message })
  }

  async deleteUserData(userId: number): Promise<void> {
    for (const table of ["publications", "posts", "templates", "publish_targets", "buttons", "drafts"]) {
      const { error } = await this.db.from(table).delete().eq("telegram_user_id", userId)
      if (error) throw new Error(`data deletion failed: ${error.message}`)
    }
  }
}
