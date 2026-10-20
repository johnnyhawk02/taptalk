# Edit on the computer, update Robyn's tablet

You edit Robyn's board in TapTalk on your computer and press **Send to tablet**. Her tablet picks up the new board by itself: when TapTalk opens, when it comes back on screen, and every 5 minutes while it's open. It never swaps the board while Robyn is in the middle of a sentence.

The board and its photos are kept in a **private** GitHub repository that only you can see: <https://github.com/johnnyhawk02/taptalk-robyn>. Each device needs its own GitHub token. The computer's token can change the board. The tablet's token can only read it.

Setup takes about 10 minutes.

---

## 1. Make two tokens on GitHub

Do this twice, once for each device. Go to <https://github.com/settings/personal-access-tokens/new>.

| Setting | Computer token | Tablet token |
|---|---|---|
| **Token name** | `TapTalk computer` | `TapTalk tablet` |
| **Expiration** | the longest option offered | the longest option offered |
| **Repository access** | *Only select repositories* → `taptalk-robyn` | *Only select repositories* → `taptalk-robyn` |
| **Permissions → Repository → Contents** | **Read and write** | **Read-only** |

Click **Generate token** and copy it. It starts with `github_pat_`. GitHub only shows it once, so paste it into TapTalk straight away (steps 3 and 4).

Don't share these tokens with anyone. If the tablet is ever lost, delete its token on GitHub. If a token expires, TapTalk says so; make a new one and paste it in.

## 2. Copy the tablet's current board to the computer (once)

Robyn's board is on the tablet right now, with your pasted photos. Start the computer off with that same board:

1. **Tablet:** hold the circle (top right) → **Save backup**. Then AirDrop or email the file to your computer.
2. **Computer:** open <https://johnnyhawk02.github.io/taptalk/> in Safari or Chrome. Click and hold the circle → **Load backup** → choose the file.

## 3. Set up the computer

On the computer, in TapTalk's grown-up settings:

1. Under **Update the tablet from a computer**, set **This device** to **Edits the board (computer)**.
2. Paste the **computer token**.

## 4. Set up the tablet

On Robyn's tablet, in TapTalk's grown-up settings:

1. Under **Update the tablet from a computer**, set **This device** to **Gets the board (tablet)**.
2. Paste the **tablet token**. It checks for an update straight away.

## Day to day

1. On the computer, click **Edit** in the top bar (or press **E**) and make your changes. Press **E** or **Esc** when you're done. The computer stays in edit mode if you reload the page.
2. Press **Send to tablet**. It's in the purple editing bar, and in the grown-up settings too.
3. The tablet updates the next time TapTalk is opened, or within 5 minutes. To update it right away: grown-up settings → **Check for updates now**.

Good to know:
- **The computer's board is the master.** Anything changed directly on the tablet is replaced by the next send. (The tablet's edit bar says so.)
- **The voice stays per device**, because the tablet and computer have different voices. Everything else is sent: buttons, pages, photos, and settings like buttons-per-row and skin colour.
- **Photos only upload once.** After that, only the small board file is sent.
- **Every send is saved in the repository's history** on GitHub, so an older board can be recovered if something goes wrong.
