# CardNote

CardNote is a lightweight SiYuan plugin for capturing Markdown card notes, extracting tags, and optionally syncing cards to today's daily note.

## Features

- Capture cards quickly with titles, Markdown content, lists, tasks, quotes, and images.
- Extract `#tags` automatically and use them for search, filtering, renaming, and cleanup.
- Switch between list and card views, with sorting by created time, updated time, or pinned status.
- Sync cards to today's SiYuan daily note and keep the linked block state visible.
- Read content back from linked daily-note blocks when edits are made in SiYuan.
- Surface older cards in a daily review strip so ideas can keep evolving.
- Back up local data and import or export cards as JSON.

## Usage

1. Open the CardNote tab.
2. Write a title and content in the capture box, then save the card.
3. Select a daily-note notebook in settings to enable daily-note syncing.
4. Use search, tags, and status filters in the sidebar to find cards quickly.
5. Use daily review to mark cards as reviewed, postpone them, or append new thoughts.

## Data

Card data is stored in the plugin's local data by default. When a card is synced to a daily note, CardNote stores the linked block ID so it can update or read the block later. Importing data replaces the current local cards, so create a backup or export first when needed.
