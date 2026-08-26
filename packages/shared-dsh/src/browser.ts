/**
 * Browser-safe entry: everything in shared-dsh that builds into a WebView
 * without Node.js builtins (the RemoteClient and its transports). Import
 * `@dsh-platform/shared-dsh/browser` (or `/remote-client`) from mobile /
 * harmony apps; the Node-only modules stay under the package root.
 *
 * @module @dsh-platform/shared-dsh/browser
 */
export * from './remote-client'
