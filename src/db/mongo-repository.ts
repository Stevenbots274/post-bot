import { randomUUID } from "node:crypto"
import { MongoClient, type Db } from "mongodb"
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

type Document = Record<string, any> & { _id?: string | number }

function withoutId(row: Document): Document {
  const { _id: ignored, ...value } = row
  return value
}

function mapDraft(row: Document): Draft {
  return {
    ...withoutId(row),
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  } as Draft
}

function mapSettings(row: Document | null): UserSettings {
  const settings = row?.settings && typeof row.settings === "object" ? row.settings : {}
  return {
    autoButtons: Array.isArray(settings.autoButtons) ? settings.autoButtons : [],
    ...(settings.pendingAutoButton ? { pendingAutoButton: settings.pendingAutoButton } : {}),
  }
}

function mapPost(row: Document): StoredPost {
  return { ...withoutId(row), buttons: Array.isArray(row.buttons) ? row.buttons : [] } as StoredPost
}

function mapScheduled(row: Document): ScheduledPost {
  return { ...withoutId(row), chat_id: Number(row.chat_id), telegram_message_id: row.telegram_message_id == null ? row.telegram_message_id : Number(row.telegram_message_id) } as ScheduledPost
}

function mapTemplate(row: Document): Template {
  return { ...withoutId(row), buttons: Array.isArray(row.buttons) ? row.buttons : [] } as Template
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000
}

export class MongoRepository implements Repository {
  private readonly client: MongoClient
  private readonly db: Db
  private readonly ready: Promise<void>

  constructor(uri: string, databaseName: string) {
    this.client = new MongoClient(uri)
    this.db = this.client.db(databaseName)
    this.ready = this.client.connect().then(() => this.createIndexes())
  }

  private collection(name: string) {
    return this.db.collection<Document>(name)
  }

  private async createIndexes(): Promise<void> {
    await Promise.all([
      this.collection("users").createIndex({ telegram_user_id: 1 }, { unique: true }),
      this.collection("drafts").createIndex({ telegram_user_id: 1, updated_at: -1 }),
      this.collection("templates").createIndex({ telegram_user_id: 1, updated_at: -1 }),
      this.collection("publish_targets").createIndex({ telegram_user_id: 1, chat_id: 1 }, { unique: true }),
      this.collection("scheduled_posts").createIndex({ scheduled_for: 1 }, { partialFilterExpression: { status: "pending" } }),
      this.collection("scheduled_posts").createIndex(
        { post_id: 1, chat_id: 1 },
        { unique: true, partialFilterExpression: { status: { $in: ["pending", "processing", "published"] } } },
      ),
      this.collection("publications").createIndex(
        { post_id: 1, chat_id: 1 },
        { unique: true, partialFilterExpression: { status: { $in: ["publishing", "published"] } } },
      ),
      this.collection("processed_updates").createIndex({ update_id: 1 }, { unique: true }),
    ])
  }

  async upsertUser(user: TelegramUser): Promise<void> {
    await this.ready
    await this.collection("users").updateOne(
      { telegram_user_id: user.id },
      {
        $set: {
          username: user.username ?? null,
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          language_code: user.language_code ?? null,
          updated_at: new Date().toISOString(),
        },
        $setOnInsert: { _id: String(user.id), telegram_user_id: user.id, settings: {} },
      },
      { upsert: true },
    )
  }

  async getUserSettings(userId: number): Promise<UserSettings> {
    await this.ready
    return mapSettings(await this.collection("users").findOne({ telegram_user_id: userId }))
  }

  async updateUserSettings(userId: number, patch: UserSettingsPatch): Promise<UserSettings> {
    const current = await this.getUserSettings(userId)
    const next: UserSettings = { ...current }
    if (patch.autoButtons) next.autoButtons = patch.autoButtons
    if (patch.pendingAutoButton === null) delete next.pendingAutoButton
    else if (patch.pendingAutoButton) next.pendingAutoButton = patch.pendingAutoButton
    await this.collection("users").updateOne({ telegram_user_id: userId }, { $set: { settings: next, updated_at: new Date().toISOString() } })
    return next
  }

  async getDraft(userId: number): Promise<Draft | null> {
    await this.ready
    const row = await this.collection("drafts").findOne({ telegram_user_id: userId }, { sort: { updated_at: -1 } })
    return row ? mapDraft(row) : null
  }

  async createDraft(userId: number, contentType: ContentType, state: DraftState, buttons: ButtonDefinition[] = []): Promise<Draft> {
    await this.ready
    const now = new Date().toISOString()
    const row = { _id: randomUUID(), id: randomUUID(), telegram_user_id: userId, content_type: contentType, state, buttons, metadata: {}, created_at: now, updated_at: now }
    row.id = row._id
    await this.collection("drafts").insertOne(row)
    return mapDraft(row)
  }

  async updateDraft(id: string, patch: Partial<Pick<Draft, "content_type" | "body" | "caption" | "telegram_file_id" | "telegram_file_unique_id" | "buttons" | "state" | "metadata">>): Promise<Draft> {
    await this.ready
    const row = await this.collection("drafts").findOneAndUpdate({ id }, { $set: { ...patch, updated_at: new Date().toISOString() } }, { returnDocument: "after" })
    if (!row) throw new Error("draft update failed: draft not found")
    return mapDraft(row)
  }

  async deleteDraft(id: string): Promise<void> {
    await this.ready
    await this.collection("drafts").deleteOne({ id })
  }

  async createPost(draft: Draft, status = "publishing"): Promise<{ id: string }> {
    await this.ready
    const row = { _id: draft.id, id: draft.id, telegram_user_id: draft.telegram_user_id, content_type: draft.content_type, body: draft.body, caption: draft.caption, telegram_file_id: draft.telegram_file_id, buttons: draft.buttons, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    try {
      await this.collection("posts").insertOne(row)
    } catch (error) {
      if (!isDuplicateError(error)) throw new Error(`post creation failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }
    return { id: draft.id }
  }

  async schedulePost(draft: Draft, chatId: number, scheduledFor: string): Promise<{ id: string }> {
    const post = await this.createPost(draft, "scheduled")
    await this.ready
    const row = { _id: randomUUID(), id: randomUUID(), post_id: post.id, telegram_user_id: draft.telegram_user_id, chat_id: chatId, scheduled_for: scheduledFor, status: "pending", created_at: new Date().toISOString() }
    row.id = row._id
    try {
      await this.collection("scheduled_posts").insertOne(row)
      return { id: row.id }
    } catch (error) {
      if (!isDuplicateError(error)) throw new Error(`schedule creation failed: ${error instanceof Error ? error.message : "unknown error"}`)
      const existing = await this.collection("scheduled_posts").findOne({ post_id: post.id, chat_id: chatId, status: "pending" })
      if (!existing) throw new Error("schedule lookup failed: empty response")
      return { id: String(existing.id) }
    }
  }

  async listDueSchedules(now = new Date().toISOString()): Promise<ScheduledPost[]> {
    await this.ready
    const rows = await this.collection("scheduled_posts").find({ status: "pending", scheduled_for: { $lte: now } }).sort({ scheduled_for: 1 }).limit(20).toArray()
    return rows.map(mapScheduled)
  }

  async claimSchedule(id: string): Promise<ScheduledPost | null> {
    await this.ready
    const row = await this.collection("scheduled_posts").findOneAndUpdate({ id, status: "pending" }, { $set: { status: "processing" } }, { returnDocument: "after" })
    return row ? mapScheduled(row) : null
  }

  async getPost(postId: string): Promise<StoredPost | null> {
    await this.ready
    const row = await this.collection("posts").findOne({ id: postId })
    return row ? mapPost(row) : null
  }

  async getPostForUser(postId: string, userId: number): Promise<StoredPost | null> {
    await this.ready
    const row = await this.collection("posts").findOne({ id: postId, telegram_user_id: userId })
    return row ? mapPost(row) : null
  }

  async updateScheduledPost(id: string, patch: { status: ScheduledPost["status"]; telegram_message_id?: number; error_message?: string }): Promise<void> {
    await this.ready
    const values: Document = { status: patch.status }
    if (patch.telegram_message_id !== undefined) values.telegram_message_id = patch.telegram_message_id
    if (patch.error_message !== undefined) values.error_message = patch.error_message
    const result = await this.collection("scheduled_posts").updateOne({ id }, { $set: values })
    if (!result.matchedCount) throw new Error("schedule update failed: schedule not found")
  }

  async listScheduledPosts(userId: number): Promise<ScheduledPost[]> {
    await this.ready
    const rows = await this.collection("scheduled_posts").find({ telegram_user_id: userId, status: { $in: ["pending", "processing"] } }).sort({ scheduled_for: 1 }).toArray()
    return rows.map(mapScheduled)
  }

  async cancelScheduledPost(id: string, userId: number): Promise<boolean> {
    await this.ready
    const result = await this.collection("scheduled_posts").updateOne({ id, telegram_user_id: userId, status: "pending" }, { $set: { status: "cancelled" } })
    return result.modifiedCount > 0
  }

  async updatePostStatus(postId: string, status: string): Promise<void> {
    await this.ready
    await this.collection("posts").updateOne({ id: postId }, { $set: { status, updated_at: new Date().toISOString() } })
  }

  async claimPublication(postId: string, userId: number, chatId: number): Promise<{ id: string } | null> {
    await this.ready
    const existing = await this.collection("publications").findOne({ post_id: postId, chat_id: chatId, status: { $in: ["publishing", "published"] } })
    if (existing) return null
    const row = { _id: randomUUID(), id: randomUUID(), post_id: postId, telegram_user_id: userId, chat_id: chatId, status: "publishing", created_at: new Date().toISOString() }
    row.id = row._id
    try {
      await this.collection("publications").insertOne(row)
      return { id: row.id }
    } catch (error) {
      if (isDuplicateError(error)) return null
      throw new Error(`publication claim failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  async updatePublication(publicationId: string, patch: { status: string; telegram_message_id?: number; error_code?: string; error_message?: string }): Promise<void> {
    await this.ready
    const values: Document = { status: patch.status, published_at: patch.status === "published" ? new Date().toISOString() : null }
    if (patch.telegram_message_id !== undefined) values.telegram_message_id = patch.telegram_message_id
    if (patch.error_code !== undefined) values.error_code = patch.error_code
    if (patch.error_message !== undefined) values.error_message = patch.error_message
    const result = await this.collection("publications").updateOne({ id: publicationId }, { $set: values })
    if (!result.matchedCount) throw new Error("publication update failed: publication not found")
  }

  async listTargets(userId: number): Promise<PublishTarget[]> {
    await this.ready
    return (await this.collection("publish_targets").find({ telegram_user_id: userId, can_post: true }).sort({ chat_title: 1 }).toArray()).map((row) => withoutId(row) as PublishTarget)
  }

  async getTarget(id: string, userId: number): Promise<PublishTarget | null> {
    await this.ready
    return (await this.collection("publish_targets").findOne({ id, telegram_user_id: userId, can_post: true })) as PublishTarget | null
  }

  async registerTarget(target: Omit<PublishTarget, "id">): Promise<void> {
    await this.ready
    await this.collection("publish_targets").updateOne(
      { telegram_user_id: target.telegram_user_id, chat_id: target.chat_id },
      { $set: { ...target, updated_at: new Date().toISOString() }, $setOnInsert: { _id: randomUUID(), id: randomUUID(), created_at: new Date().toISOString() } },
      { upsert: true },
    )
  }

  async deleteTarget(id: string, userId: number): Promise<boolean> {
    await this.ready
    const result = await this.collection("publish_targets").deleteOne({ id, telegram_user_id: userId })
    return result.deletedCount > 0
  }

  async listTemplates(userId: number): Promise<Template[]> {
    await this.ready
    return (await this.collection("templates").find({ telegram_user_id: userId }).sort({ updated_at: -1 }).toArray()).map(mapTemplate)
  }

  async getTemplate(id: string, userId: number): Promise<Template | null> {
    await this.ready
    const row = await this.collection("templates").findOne({ id, telegram_user_id: userId })
    return row ? mapTemplate(row) : null
  }

  async saveTemplate(input: Omit<Template, "id" | "is_public">): Promise<void> {
    await this.ready
    await this.collection("templates").insertOne({ _id: randomUUID(), id: randomUUID(), ...input, is_public: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }

  async listPosts(userId: number): Promise<Array<{ id: string; content_type: ContentType; status: string; created_at: string }>> {
    await this.ready
    const rows = await this.collection("posts").find({ telegram_user_id: userId }).sort({ created_at: -1 }).limit(10).toArray()
    return rows.map((row) => ({ id: String(row.id), content_type: row.content_type as ContentType, status: String(row.status), created_at: String(row.created_at) }))
  }

  async claimUpdate(updateId: number): Promise<boolean> {
    await this.ready
    try {
      await this.collection("processed_updates").insertOne({ _id: String(updateId), update_id: updateId, processed_at: new Date().toISOString() })
      return true
    } catch (error) {
      if (isDuplicateError(error)) return false
      throw new Error(`update claim failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  async releaseUpdate(updateId: number): Promise<void> {
    await this.ready
    try {
      await this.collection("processed_updates").deleteOne({ update_id: updateId })
    } catch (error) {
      console.error("Could not release failed update", { updateId, error: error instanceof Error ? error.message : "unknown error" })
    }
  }

  async deleteUserData(userId: number): Promise<void> {
    await this.ready
    for (const collection of ["publications", "scheduled_posts", "posts", "templates", "publish_targets", "buttons", "drafts"]) {
      await this.collection(collection).deleteMany({ telegram_user_id: userId })
    }
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
