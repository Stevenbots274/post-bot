import { Pool } from "pg"
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
import type { Repository, UserSettingsPatch } from "./repository.js"

type Row = Record<string, any>

function jsonValue(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value)
}

function mapDraft(row: Row): Draft {
  return {
    ...row,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    buttons: jsonValue(row.buttons, []) as ButtonDefinition[],
    metadata: jsonValue(row.metadata, {}) as Record<string, unknown>,
  } as Draft
}

function mapSettings(row: Row | null): UserSettings {
  const settings = jsonValue(row?.settings, {}) as Row
  return {
    autoButtons: Array.isArray(settings.autoButtons) ? settings.autoButtons : [],
    ...(settings.pendingAutoButton ? { pendingAutoButton: settings.pendingAutoButton } : {}),
  }
}

function mapPost(row: Row): StoredPost {
  return {
    ...row,
    created_at: iso(row.created_at),
    buttons: jsonValue(row.buttons, []) as ButtonDefinition[],
  } as StoredPost
}

function mapScheduled(row: Row): ScheduledPost {
  return { ...row, scheduled_for: iso(row.scheduled_for), chat_id: integer(row.chat_id), telegram_message_id: row.telegram_message_id == null ? row.telegram_message_id : integer(row.telegram_message_id) } as ScheduledPost
}

function mapTarget(row: Row): PublishTarget {
  return { ...row, chat_id: integer(row.chat_id) } as PublishTarget
}

function mapTemplate(row: Row): Template {
  return { ...row, buttons: jsonValue(row.buttons, []) as ButtonDefinition[] } as Template
}

function isUniqueError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505"
}

export class NeonRepository implements Repository {
  private readonly pool: Pool

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl })
  }

  private async query(text: string, values: unknown[] = []): Promise<Row[]> {
    const result = await this.pool.query(text, values)
    return result.rows as Row[]
  }

  private async one(text: string, values: unknown[] = []): Promise<Row | null> {
    return (await this.query(text, values))[0] ?? null
  }

  async upsertUser(user: TelegramUser): Promise<void> {
    await this.query(
      `insert into users (telegram_user_id, username, first_name, last_name, language_code, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (telegram_user_id) do update set username = excluded.username,
       first_name = excluded.first_name, last_name = excluded.last_name,
       language_code = excluded.language_code, updated_at = now()`,
      [user.id, user.username ?? null, user.first_name ?? null, user.last_name ?? null, user.language_code ?? null],
    )
  }

  async getUserSettings(userId: number): Promise<UserSettings> {
    return mapSettings(await this.one("select settings from users where telegram_user_id = $1", [userId]))
  }

  async updateUserSettings(userId: number, patch: UserSettingsPatch): Promise<UserSettings> {
    const current = await this.getUserSettings(userId)
    const next: UserSettings = { ...current }
    if (patch.autoButtons) next.autoButtons = patch.autoButtons
    if (patch.pendingAutoButton === null) delete next.pendingAutoButton
    else if (patch.pendingAutoButton) next.pendingAutoButton = patch.pendingAutoButton
    await this.query("update users set settings = $1::jsonb, updated_at = now() where telegram_user_id = $2", [JSON.stringify(next), userId])
    return next
  }

  async getDraft(userId: number): Promise<Draft | null> {
    const row = await this.one("select * from drafts where telegram_user_id = $1 order by updated_at desc limit 1", [userId])
    return row ? mapDraft(row) : null
  }

  async createDraft(userId: number, contentType: ContentType, state: DraftState, buttons: ButtonDefinition[] = []): Promise<Draft> {
    const row = await this.one(
      "insert into drafts (telegram_user_id, content_type, state, buttons) values ($1, $2, $3, $4::jsonb) returning *",
      [userId, contentType, state, JSON.stringify(buttons)],
    )
    if (!row) throw new Error("draft creation failed: empty response")
    return mapDraft(row)
  }

  async updateDraft(id: string, patch: Partial<Pick<Draft, "content_type" | "body" | "caption" | "telegram_file_id" | "telegram_file_unique_id" | "buttons" | "state" | "metadata">>): Promise<Draft> {
    const keys = Object.keys(patch) as Array<keyof typeof patch>
    if (!keys.length) {
      const row = await this.one("select * from drafts where id = $1", [id])
      if (!row) throw new Error("draft update failed: draft not found")
      return mapDraft(row)
    }
    const values = keys.map((key) => key === "buttons" || key === "metadata" ? JSON.stringify(patch[key]) : patch[key])
    const assignments = keys.map((key, index) => `${key} = $${index + 1}${key === "buttons" || key === "metadata" ? "::jsonb" : ""}`)
    values.push(new Date().toISOString(), id)
    const row = await this.one(`update drafts set ${assignments.join(", ")}, updated_at = $${values.length - 1} where id = $${values.length} returning *`, values)
    if (!row) throw new Error("draft update failed: draft not found")
    return mapDraft(row)
  }

  async deleteDraft(id: string): Promise<void> {
    await this.query("delete from drafts where id = $1", [id])
  }

  async createPost(draft: Draft, status = "publishing"): Promise<{ id: string }> {
    const row = await this.one(
      `insert into posts (id, telegram_user_id, content_type, body, caption, telegram_file_id, buttons, status)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (id) do nothing returning id`,
      [draft.id, draft.telegram_user_id, draft.content_type, draft.body, draft.caption, draft.telegram_file_id, JSON.stringify(draft.buttons), status],
    )
    return { id: String(row?.id ?? draft.id) }
  }

  async schedulePost(draft: Draft, chatId: number, scheduledFor: string): Promise<{ id: string }> {
    const post = await this.createPost(draft, "scheduled")
    try {
      const row = await this.one(
        "insert into scheduled_posts (post_id, telegram_user_id, chat_id, scheduled_for, status) values ($1, $2, $3, $4, 'pending') returning id",
        [post.id, draft.telegram_user_id, chatId, scheduledFor],
      )
      if (!row) throw new Error("schedule creation failed: empty response")
      return { id: String(row.id) }
    } catch (error) {
      if (!isUniqueError(error)) throw new Error(`schedule creation failed: ${error instanceof Error ? error.message : "unknown error"}`)
      const row = await this.one("select id from scheduled_posts where post_id = $1 and chat_id = $2 and status = 'pending'", [post.id, chatId])
      if (!row) throw new Error("schedule lookup failed: empty response")
      return { id: String(row.id) }
    }
  }

  async listDueSchedules(now = new Date().toISOString()): Promise<ScheduledPost[]> {
    const rows = await this.query("select * from scheduled_posts where status = 'pending' and scheduled_for <= $1 order by scheduled_for asc limit 20", [now])
    return rows.map(mapScheduled)
  }

  async claimSchedule(id: string): Promise<ScheduledPost | null> {
    const row = await this.one("update scheduled_posts set status = 'processing' where id = $1 and status = 'pending' returning *", [id])
    return row ? mapScheduled(row) : null
  }

  async getPost(postId: string): Promise<StoredPost | null> {
    const row = await this.one("select * from posts where id = $1", [postId])
    return row ? mapPost(row) : null
  }

  async getPostForUser(postId: string, userId: number): Promise<StoredPost | null> {
    const row = await this.one("select * from posts where id = $1 and telegram_user_id = $2", [postId, userId])
    return row ? mapPost(row) : null
  }

  async updateScheduledPost(id: string, patch: { status: ScheduledPost["status"]; telegram_message_id?: number; error_message?: string }): Promise<void> {
    const row = await this.one(
      "update scheduled_posts set status = $1, telegram_message_id = coalesce($2, telegram_message_id), error_message = coalesce($3, error_message) where id = $4 returning id",
      [patch.status, patch.telegram_message_id ?? null, patch.error_message ?? null, id],
    )
    if (!row) throw new Error("schedule update failed: schedule not found")
  }

  async listScheduledPosts(userId: number): Promise<ScheduledPost[]> {
    const rows = await this.query("select * from scheduled_posts where telegram_user_id = $1 and status in ('pending', 'processing') order by scheduled_for asc", [userId])
    return rows.map(mapScheduled)
  }

  async cancelScheduledPost(id: string, userId: number): Promise<boolean> {
    const row = await this.one("update scheduled_posts set status = 'cancelled' where id = $1 and telegram_user_id = $2 and status = 'pending' returning id", [id, userId])
    return Boolean(row)
  }

  async updatePostStatus(postId: string, status: string): Promise<void> {
    await this.query("update posts set status = $1, updated_at = now() where id = $2", [status, postId])
  }

  async claimPublication(postId: string, userId: number, chatId: number): Promise<{ id: string } | null> {
    const existing = await this.one("select id from publications where post_id = $1 and chat_id = $2 and status in ('publishing', 'published')", [postId, chatId])
    if (existing) return null
    try {
      const row = await this.one("insert into publications (post_id, telegram_user_id, chat_id, status) values ($1, $2, $3, 'publishing') returning id", [postId, userId, chatId])
      return row ? { id: String(row.id) } : null
    } catch (error) {
      if (isUniqueError(error)) return null
      throw new Error(`publication claim failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  async updatePublication(publicationId: string, patch: { status: string; telegram_message_id?: number; error_code?: string; error_message?: string }): Promise<void> {
    const row = await this.one(
      "update publications set status = $1, telegram_message_id = $2, error_code = $3, error_message = $4, published_at = case when $1 = 'published' then now() else null end where id = $5 returning id",
      [patch.status, patch.telegram_message_id ?? null, patch.error_code ?? null, patch.error_message ?? null, publicationId],
    )
    if (!row) throw new Error("publication update failed: publication not found")
  }

  async listTargets(userId: number): Promise<PublishTarget[]> {
    const rows = await this.query("select * from publish_targets where telegram_user_id = $1 and can_post = true order by chat_title asc", [userId])
    return rows.map(mapTarget)
  }

  async getTarget(id: string, userId: number): Promise<PublishTarget | null> {
    const row = await this.one("select * from publish_targets where id = $1 and telegram_user_id = $2 and can_post = true", [id, userId])
    return row ? mapTarget(row) : null
  }

  async registerTarget(target: Omit<PublishTarget, "id">): Promise<void> {
    await this.query(
      `insert into publish_targets (telegram_user_id, chat_id, chat_title, chat_username, chat_type, can_post, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (telegram_user_id, chat_id) do update set chat_title = excluded.chat_title,
       chat_username = excluded.chat_username, chat_type = excluded.chat_type,
       can_post = excluded.can_post, updated_at = now()`,
      [target.telegram_user_id, target.chat_id, target.chat_title, target.chat_username, target.chat_type, target.can_post],
    )
  }

  async deleteTarget(id: string, userId: number): Promise<boolean> {
    return Boolean(await this.one("delete from publish_targets where id = $1 and telegram_user_id = $2 returning id", [id, userId]))
  }

  async listTemplates(userId: number): Promise<Template[]> {
    const rows = await this.query("select * from templates where telegram_user_id = $1 order by updated_at desc", [userId])
    return rows.map(mapTemplate)
  }

  async getTemplate(id: string, userId: number): Promise<Template | null> {
    const row = await this.one("select * from templates where id = $1 and telegram_user_id = $2", [id, userId])
    return row ? mapTemplate(row) : null
  }

  async saveTemplate(input: Omit<Template, "id" | "is_public">): Promise<void> {
    await this.query(
      "insert into templates (telegram_user_id, name, content_type, body, caption, buttons, is_public) values ($1, $2, $3, $4, $5, $6::jsonb, false)",
      [input.telegram_user_id, input.name, input.content_type, input.body, input.caption, JSON.stringify(input.buttons)],
    )
  }

  async listPosts(userId: number): Promise<Array<{ id: string; content_type: ContentType; status: string; created_at: string }>> {
    const rows = await this.query("select id, content_type, status, created_at from posts where telegram_user_id = $1 order by created_at desc limit 10", [userId])
    return rows.map((row) => ({ id: String(row.id), content_type: row.content_type as ContentType, status: String(row.status), created_at: iso(row.created_at) }))
  }

  async claimUpdate(updateId: number): Promise<boolean> {
    try {
      await this.query("insert into processed_updates (update_id) values ($1)", [updateId])
      return true
    } catch (error) {
      if (isUniqueError(error)) return false
      throw new Error(`update claim failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  async releaseUpdate(updateId: number): Promise<void> {
    try {
      await this.query("delete from processed_updates where update_id = $1", [updateId])
    } catch (error) {
      console.error("Could not release failed update", { updateId, error: error instanceof Error ? error.message : "unknown error" })
    }
  }

  async deleteUserData(userId: number): Promise<void> {
    for (const table of ["publications", "scheduled_posts", "posts", "templates", "publish_targets", "buttons", "drafts"]) {
      await this.query(`delete from ${table} where telegram_user_id = $1`, [userId])
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
