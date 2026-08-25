import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type {
  ButtonDefinition,
  ContentType,
  Draft,
  DraftState,
  PublishTarget,
  ScheduledPost,
  StoredPost,
  TelegramUser,
  Template,
  UserSettings,
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

function mapUserSettings(row: Row | null): UserSettings {
  const settings = row?.settings && typeof row.settings === "object" ? row.settings : {}
  return {
    autoButtons: Array.isArray(settings.autoButtons) ? settings.autoButtons : [],
    ...(settings.pendingAutoButton ? { pendingAutoButton: settings.pendingAutoButton } : {}),
  }
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

  async getUserSettings(userId: number): Promise<UserSettings> {
    const { data, error } = await this.db.from("users").select("settings").eq("telegram_user_id", userId).maybeSingle()
    if (error) throw new Error(`settings lookup failed: ${error.message}`)
    return mapUserSettings(data)
  }

  async updateUserSettings(
    userId: number,
    patch: { autoButtons?: ButtonDefinition[]; pendingAutoButton?: UserSettings["pendingAutoButton"] | null },
  ): Promise<UserSettings> {
    const current = await this.getUserSettings(userId)
    const next: UserSettings = { ...current }
    if (patch.autoButtons) next.autoButtons = patch.autoButtons
    if (patch.pendingAutoButton === null) delete next.pendingAutoButton
    else if (patch.pendingAutoButton) next.pendingAutoButton = patch.pendingAutoButton
    const { error } = await this.db
      .from("users")
      .update({ settings: next, updated_at: new Date().toISOString() })
      .eq("telegram_user_id", userId)
    if (error) throw new Error(`settings update failed: ${error.message}`)
    return next
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

  async createDraft(userId: number, contentType: ContentType, state: DraftState, buttons: ButtonDefinition[] = []): Promise<Draft> {
    const { data, error } = await this.db
      .from("drafts")
      .insert({ telegram_user_id: userId, content_type: contentType, state, buttons })
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

  async createPost(draft: Draft, status = "publishing"): Promise<{ id: string }> {
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
        status,
      })
      .select("id")
      .single()
    if (error?.code === "23505") return { id: draft.id }
    if (error || !data) throw new Error(`post creation failed: ${error?.message ?? "empty response"}`)
    return data as { id: string }
  }

  async schedulePost(draft: Draft, chatId: number, scheduledFor: string): Promise<{ id: string }> {
    const post = await this.createPost(draft, "scheduled")
    const { data, error } = await this.db
      .from("scheduled_posts")
      .insert({ post_id: post.id, telegram_user_id: draft.telegram_user_id, chat_id: chatId, scheduled_for: scheduledFor, status: "pending" })
      .select("id")
      .single()
    if (error?.code === "23505") {
      const { data: existing, error: lookupError } = await this.db
        .from("scheduled_posts")
        .select("id")
        .eq("post_id", post.id)
        .eq("chat_id", chatId)
        .eq("status", "pending")
        .single()
      if (lookupError || !existing) throw new Error(`schedule lookup failed: ${lookupError?.message ?? "empty response"}`)
      return existing as { id: string }
    }
    if (error || !data) throw new Error(`schedule creation failed: ${error?.message ?? "empty response"}`)
    return data as { id: string }
  }

  async listDueSchedules(now = new Date().toISOString()): Promise<ScheduledPost[]> {
    const { data, error } = await this.db
      .from("scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20)
    if (error) throw new Error(`schedule lookup failed: ${error.message}`)
    return (data ?? []) as ScheduledPost[]
  }

  async claimSchedule(id: string): Promise<ScheduledPost | null> {
    const { data, error } = await this.db
      .from("scheduled_posts")
      .update({ status: "processing" })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle()
    if (error) throw new Error(`schedule claim failed: ${error.message}`)
    return (data as ScheduledPost | null) ?? null
  }

  async getPost(postId: string): Promise<StoredPost | null> {
    const { data, error } = await this.db.from("posts").select("*").eq("id", postId).maybeSingle()
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    if (!data) return null
    return { ...data, buttons: Array.isArray(data.buttons) ? data.buttons : [] } as StoredPost
  }

  async getPostForUser(postId: string, userId: number): Promise<StoredPost | null> {
    const { data, error } = await this.db
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("telegram_user_id", userId)
      .maybeSingle()
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    if (!data) return null
    return { ...data, buttons: Array.isArray(data.buttons) ? data.buttons : [] } as StoredPost
  }

  async updateScheduledPost(
    id: string,
    patch: { status: ScheduledPost["status"]; telegram_message_id?: number; error_message?: string },
  ): Promise<void> {
    const { error } = await this.db.from("scheduled_posts").update(patch).eq("id", id)
    if (error) throw new Error(`schedule update failed: ${error.message}`)
  }

  async listScheduledPosts(userId: number): Promise<ScheduledPost[]> {
    const { data, error } = await this.db
      .from("scheduled_posts")
      .select("*")
      .eq("telegram_user_id", userId)
      .in("status", ["pending", "processing"])
      .order("scheduled_for", { ascending: true })
    if (error) throw new Error(`schedule lookup failed: ${error.message}`)
    return (data ?? []) as ScheduledPost[]
  }

  async cancelScheduledPost(id: string, userId: number): Promise<boolean> {
    const { data, error } = await this.db
      .from("scheduled_posts")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("telegram_user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`schedule cancellation failed: ${error.message}`)
    return Boolean(data)
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

  async deleteTarget(id: string, userId: number): Promise<boolean> {
    const { data, error } = await this.db
      .from("publish_targets")
      .delete()
      .eq("id", id)
      .eq("telegram_user_id", userId)
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`target deletion failed: ${error.message}`)
    return Boolean(data)
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
    for (const table of ["publications", "scheduled_posts", "posts", "templates", "publish_targets", "buttons", "drafts"]) {
      const { error } = await this.db.from(table).delete().eq("telegram_user_id", userId)
      if (error) throw new Error(`data deletion failed: ${error.message}`)
    }
  }
}
