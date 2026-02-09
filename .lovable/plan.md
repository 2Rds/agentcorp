

# Continuous Agent Experience

Transform the chat from a multi-conversation model into a single, continuous agent thread per organization -- one persistent conversation that picks up where you left off every time.

## What Changes

- **Single thread per org**: When you open the app, your existing conversation loads automatically with full history. No "New Conversation" button, no conversation picker.
- **Auto-creation**: If no conversation exists yet (first use), one is created silently in the background.
- **Seamless continuity**: Every message is appended to the same thread, making the agent feel like a persistent co-pilot.

## Technical Details

### 1. Simplify `useConversations` hook
- Remove `conversations` list, `activeId` selection, and `createConversation` with custom titles
- Replace with a single `useAgentThread` hook that:
  - Queries for the org's single conversation (fetches the first conversation by `organization_id`)
  - If none exists, auto-creates one titled "Agent Thread"
  - Loads all messages for that thread
  - Exposes `messages`, `addMessage`, `loadingMessages`, and `threadId`

### 2. Update `Chat.tsx`
- Remove conversation selection logic
- On mount, the hook provides the thread and messages automatically
- `handleSend` always appends to the single thread
- Remove the "New Conversation" starter prompts concept stays, but they just send to the existing thread

### 3. Update `AppSidebar.tsx`
- Remove the "New Conversation" button (lines 62-69)
- Chat nav item stays as-is, just navigates to the single continuous thread

### 4. No database changes needed
- The existing `conversations` and `messages` tables work perfectly
- We simply only ever use one conversation per org
