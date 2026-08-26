/**
 * DSH domain types — a stable, minimal projection of the DeepSeek Harness
 * public seams (`ctx.tools`, `ctx.llm`, `ctx.sessions`, `ctx.logger`).
 *
 * Plugins must only depend on these shapes; never on DSH internals.
 * @module @dsh-platform/shared-bridge/types
 */

/** A DSH workspace session. */
export interface Session {
  id: string
  title: string
  /** ISO 8601 timestamps. */
  createdAt: string
  updatedAt: string
  /** Present for resumed sessions. */
  parentId?: string
  meta?: Record<string, unknown>
}

/** An event emitted inside a session. */
export interface SessionEvent {
  id: string
  sessionId: string
  type: 'message' | 'status' | 'system'
  payload: Record<string, unknown>
  timestamp: number
}

/** A single agent turn inside a session. */
export interface Turn {
  id: string
  sessionId: string
  status: 'running' | 'stopped' | 'error'
  startedAt: number
  endedAt?: number
  model?: string
  messageCount?: number
}

/** Tool parameter schema fragment (subset of JSON Schema). */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string
  enum?: readonly unknown[]
  properties?: Record<string, ToolParameterSchema>
  required?: readonly string[]
}

/** A registered tool descriptor. */
export interface ToolDescriptor {
  name: string
  description: string
  parameters?: ToolParameterSchema
  /** Whether this tool mutates the filesystem / network. */
  destructive?: boolean
}

/** A concrete tool entry with its handler. */
export interface Tool<TContext = unknown> extends ToolDescriptor {
  execute: (input: unknown, context: TContext) => Promise<unknown>
}

/** LLM chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
}

export interface ChatOptions {
  sessionId?: string
  model?: string
  tools?: string[]
  temperature?: number
}

/** Public LLM seam. */
export interface LLMService {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<unknown>
}

/** Public session seam. */
export interface SessionManager {
  list(): Promise<Session[]> | Session[]
  get(id: string): Promise<Session | undefined> | Session | undefined
  create?(title?: string): Promise<Session> | Session
}

/** Public logger seam. */
export interface Logger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug?(message: string, ...args: unknown[]): void
}

/** Public command seam (surfaces that expose it). */
export interface CommandRegistry {
  register(name: string, handler: (input: unknown) => unknown): void
  list(): string[]
}

/**
 * The DSHContext a plugin receives from `apply(ctx)` — the stable seam union
 * used by dsh-platform plugins.
 */
export interface DSHContext {
  tools?: ToolRegistryLike
  llm?: LLMService
  sessions?: SessionManager
  logger: Logger
  commands?: CommandRegistry
  on(event: string, listener: (...args: any[]) => void): void
  effect(fn: () => void | (() => void), label?: string): void
}

/** Minimal tool registry shape (the real one lives in @deepseek-ai/cordis-based DSH). */
export interface ToolRegistryLike {
  register(name: string, tool: Tool): void
  list(): ToolDescriptor[]
}

/** A web client slot injected via the `web/client/slot` event. */
export interface Slot {
  id: string
  order: number
  /** Stable slot key a UI provider can claim. */
  key: string
  render: unknown
  context: Record<string, unknown>
}

/** A slot registered by the shell or a plugin. */
export interface BaseSlot {
  render: () => unknown
}
