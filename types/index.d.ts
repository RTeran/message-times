/** One noted prompt or reply row: when it was kept and what its text starts with. */
export type Stamp = {
  /** ISO time the session kept the row. */
  at: string
  /** keyOf(kind, text): the kind and the first 160 characters, spaces folded. */
  key: string
}

/** The notes, by the row's uuid (`<uuid>:<n>` for a reply's later text blocks), oldest first. */
export type Stamps = Record<string, Stamp>

/** The ids of the notes this conversation's own file holds, as opposed to other sessions' of the project. */
export type OwnIds = string[]

declare module 'claude-code' {
  interface PluginState {
    'message-times': { stamps: Shaped<Stamps>; own: Shaped<OwnIds> }
  }
}
