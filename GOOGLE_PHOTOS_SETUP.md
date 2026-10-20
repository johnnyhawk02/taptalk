# Setting up "From Google Photos"

This adds a **From Google Photos** button to the button editor. Tap it, choose a photo in Google Photos, and it lands on the button.

You need two free things, and it takes about 15 minutes:

1. **A Google Cloud "OAuth client"**. This lets TapTalk ask your permission to see the photos you pick. TapTalk only ever sees the photos you choose, never your whole library.
2. **A Cloudflare Worker (the "proxy")**. This is a tiny piece of code that downloads the chosen photo for TapTalk. Google's photo server won't send photos straight to a web page, so something in the middle has to fetch them.

When you're done you'll have two values, a **Client ID** and a **Worker URL**. They go in `js/config.js`.

---

## Part 1: Google Cloud (about 10 minutes)

Use the Google account whose photos you want to use.

### 1. Create a project
1. Go to <https://console.cloud.google.com/>.
2. Use the project picker at the top left and choose **New project**.
3. Name it `TapTalk` and click **Create**. Make sure it's selected afterwards (its name shows at the top).

### 2. Turn on the Photos Picker API
1. Go to <https://console.cloud.google.com/apis/library/photospicker.googleapis.com>, or search the API Library for **Photos Picker API**.
2. Click **Enable**.

### 3. Set up the consent screen
1. Go to **Google Auth Platform**: <https://console.cloud.google.com/auth/overview>. Click **Get started**.
2. Fill it in:
   - **App name**: `TapTalk`
   - **User support email**: your email
   - **Audience**: **External**
   - **Contact email**: your email
   - Agree to the policy and click **Create**.
3. Go to **Data Access**, then **Add or remove scopes**. Search for `photospicker`, tick **…/auth/photospicker.mediaitems.readonly**, then click **Update** and **Save**.
4. Go to **Audience**. Under **Test users**, click **Add users** and add every Google account that will pick photos (yours, your partner's…). Then **Save**.

   Leave the app in **Testing**. You don't need Google to verify it for family use. Google allows up to 100 test users.

### 4. Create the Client ID
1. Go to **Clients**, then **Create client**.
2. **Application type**: **Web application**. **Name**: `TapTalk web`.
3. **Authorised JavaScript origins**: add both of these:
   - `https://johnnyhawk02.github.io`
   - `http://localhost:8642`
4. **Authorised redirect URIs**: add both of these exactly, including the trailing slash:
   - `https://johnnyhawk02.github.io/taptalk/`
   - `http://localhost:8642/`
5. Click **Create** and copy the **Client ID**. It looks like `1234…-abc….apps.googleusercontent.com`. You don't need the client secret.

---

## Part 2: Cloudflare Worker proxy (about 5 minutes)

1. Sign up or log in at <https://dash.cloudflare.com/sign-up>. The free plan is plenty.
2. Go to **Compute (Workers) → Workers & Pages → Create**, choose **Start with Hello World!**, name it `taptalk-photos`, and click **Deploy**.
3. Click **Edit code**. Delete everything and paste in the contents of [`proxy/worker.js`](proxy/worker.js). Click **Deploy**.
4. Copy the worker's URL. It looks like `https://taptalk-photos.<your-name>.workers.dev`.

What the proxy does and doesn't do:
- It only fetches from Google's photo servers (`*.googleusercontent.com`).
- It only answers requests from TapTalk's own web addresses.
- It doesn't store photos or tokens.

If you ever host TapTalk somewhere else, add that address to `ALLOWED_ORIGINS` at the top of the worker.

<details><summary>Prefer the command line?</summary>

```bash
cd proxy
```
```bash
npx wrangler deploy worker.js --name taptalk-photos --compatibility-date 2025-01-01
```
(It asks you to log in to Cloudflare the first time.)
</details>

---

## Part 3: Switch it on

Put the two values in `js/config.js`:

```js
export const GOOGLE_CLIENT_ID = '1234…apps.googleusercontent.com';
export const PHOTO_PROXY_URL = 'https://taptalk-photos.<your-name>.workers.dev';
```

Then run `node tools/build-precache.mjs` and push to GitHub. (Or just send the two values to Claude and it'll do this.)

---

## Using it on the iPad

1. Open the button editor (hold the circle, tap **Edit buttons and pages**, then tap a button).
2. Tap **From Google Photos**.
   - **The first time** (and about once an hour after that), you'll go to a Google sign-in page. Sign in and allow access. You'll see a warning that "Google hasn't verified this app"; that's expected for a Testing app, so tap **Continue**. TapTalk then reopens the editor where you left it.
3. Tap **Open Google Photos**, choose one photo, tap **Done**, and switch back to TapTalk.
4. The photo appears on the button. Tap **Save**.

## If something goes wrong

| What you see | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` | The redirect URI in step 4 must match exactly, including the trailing `/`. |
| `Error 403: access_denied` / "app is being tested" | Add that Google account as a **Test user** (step 3.4). |
| "Could not download the photo (403)" | `ALLOWED_ORIGINS` in the worker doesn't include the address you're using, or the photo link expired. Try again. |
| The **From Google Photos** button doesn't show | `js/config.js` still has a blank value, or the iPad has an old copy. Close and reopen TapTalk while online. |
