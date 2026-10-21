# Sharing Robyn's board between the computer and her iPad

You can edit Robyn's board on your computer, and school can add things on her iPad. Both sets of changes are kept and appear on the other device.

- **Computer:** edit, then press **Send to tablet**.
- **Robyn's iPad:** picks up changes by itself when TapTalk opens, when it comes back on screen, and every 5 minutes. When someone at school edits and taps **Done**, their changes are sent automatically. If the iPad is offline, they're sent once it's back online.
- **Changes are merged, not replaced.** Each button remembers when it was last changed. If the same button was changed on both devices, the newer change wins. New buttons and pages from either side are kept, and deleted buttons stay deleted.
- **The board never changes under Robyn's finger.** An update waits until she isn't in the middle of a sentence.

The board and photos are kept in a **private** GitHub repository that only you can see: <https://github.com/johnnyhawk02/taptalk-robyn>. Every change is saved in its history, so an older board can be recovered.

---

## 1. Make a token for each device

Each device needs its own GitHub token, a password-like code that lets TapTalk read and save the board. These links fill most of the form in for you:

- **Computer:** [create the TapTalk computer token](https://github.com/settings/personal-access-tokens/new?name=TapTalk+computer&description=Lets+TapTalk+on+the+computer+share+Robyn%27s+board&target_name=johnnyhawk02&expires_in=366&contents=write)
- **Robyn's iPad:** [create the TapTalk iPad token](https://github.com/settings/personal-access-tokens/new?name=TapTalk+iPad&description=Lets+Robyn%27s+iPad+share+her+TapTalk+board&target_name=johnnyhawk02&expires_in=366&contents=write). This needs **read and write**, so school's changes can be sent.

On each one: under **Repository access** choose **Only select repositories → taptalk-robyn**, click **Generate token**, and copy it. GitHub only shows a token once, so paste it into TapTalk straight away. To get it onto the iPad, either copy it on the Mac and paste on the iPad (same Apple ID), or open the link on the iPad itself.

If a token is lost or expires, just make a new one. If the iPad is ever lost, delete its token on GitHub.

## 2. Link the computer

In TapTalk on the computer (<https://johnnyhawk02.github.io/taptalk/> in Safari or Chrome), hold the circle at the top right to open grown-up settings:

1. Under **Share the board between devices**, set **This device** to **Edits the board (computer)**.
2. Paste the computer token.
3. Press **Send board to tablet**. The first send makes the computer's board the shared one.

## 3. Link Robyn's iPad

On the iPad, in TapTalk's grown-up settings:

1. Set **This device** to **Gets the board and sends its changes (school iPad)**.
2. Paste the iPad token. It fetches the shared board straight away. The first time, the iPad takes the shared board as it is.

**Gets the board only (read-only)** is also available, for a device that should never send changes. Its edits stay on that device only.

## Day to day

- **On the computer:** click **Edit** (or press **E**), make your changes, then press **Send to tablet** in the purple bar. Press **E** or **Esc** to stop editing. While editing, the computer shows a smaller view so whole pages fit. **Full-size view** shows it the size Robyn sees it.
- **At school:** hold the circle → **Edit buttons and pages**, make changes, and tap **Done**. They're sent automatically.
- **To pick up changes right away**, on either device: grown-up settings → **Check for changes now**.
- **To choose when the iPad's board changes** (say, not during the school day): untick **Get changes automatically** on the iPad. It then only changes when you tap **Check for changes now**. School's edits are still sent when they tap **Done**.

Good to know:
- **The voice setting stays separate on each device.** Everything else is shared: buttons, pages, photos, buttons per row and skin colour.
- **Photos only upload once.** After that, only the small board file is sent.
- **If two people save at the same moment,** TapTalk notices, merges again, and retries.
