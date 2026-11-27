# FreeCell

An offline FreeCell for Android with a dark theme, drawn card art, a solver-backed hint button, unlimited undo, statistics, and your own photos as the table background. It is a small web app (plain HTML/CSS/JS, no build step) wrapped as an APK with [Capacitor](https://capacitorjs.com). GitHub Actions builds and releases the APK for you.

## What's in the game

- **Deals are numbered like classic Windows FreeCell** (1 – 1,000,000). Every deal from 1 to 32,000 can be won except #11982. Tap the deal number to replay one.
- **Hint** runs a real solver in a background thread. It highlights the card to move (brass) and where it goes (mint). If you follow the hint, the next hints are instant. If you wander off the solution it re-solves from where you are, and says so when a position can no longer be won.
- **Undo** is unlimited and survives closing the app.
- **Moves**: drag a card or a run, or just tap it and it goes to the best place (foundation → column → free cell). Sequences move together within the usual (free cells + 1) × 2^(empty columns) limit. Safe cards go to the foundations automatically (switch off in Settings), and a deal that is trivially won finishes itself.
- **Statistics**: played, won, lost, win rate, streaks, best time, fewest moves, average win time, hints and undos used, and the last 12 deals.
- **Table**: five built-in tables or **your own photo** (Settings → Photo). Photos are shrunk and stored on the phone, with Dim and Blur sliders so the cards stay readable.
- Optional **four-colour suits** and **dark cards**.
- Fully offline. The app has no analytics and makes no network requests.

## Try it on a computer

```bash
npm install
npm run serve        # http://localhost:5173
npm test             # rules + solver + storage tests
```

## How releases work

`.github/workflows/release.yml` runs on every push to `main` or `master` (and on `v*` tags, and from the Actions tab):

1. installs dependencies and runs the tests,
2. stamps the version into the app, runs `npx cap sync android`,
3. builds the release APK with Gradle, zip-aligns and signs it,
4. attaches it to a new GitHub release (`v1.0.<run number>`) with auto-generated notes.

Download the APK from the repo's **Releases** page on your phone and open it. New versions install over old ones and keep your statistics.

- **Version numbers**: the first two numbers come from `version` in `package.json` (`1.0.0` → releases are `v1.0.N`). Bump it to `1.1.0` for a new minor series. Push a tag such as `v2.0.0` to release exactly that name.
- **Only want releases for tags?** Remove the `branches:` and `paths-ignore:` lines under `on.push` in `release.yml`.
- **Build without publishing**: Actions → *Build & release APK* → *Run workflow* → untick *Publish*. The APK is kept as a workflow artifact for 30 days.
- `.github/workflows/ci.yml` runs the tests on pull requests and on branches other than `main`.

### Signing

Out of the box the APK is signed with the shared debug key in `ci/debug.keystore`. That is fine for installing on your own phone and means updates always install over each other, but anyone can sign an app with that key. For anything you share, add your own key. **Do it before you install the first build**, because Android will not update an app in place when its signing key changes (you would have to uninstall once, losing local stats).

```bash
# 1. create a key (keep the .jks file and its passwords somewhere safe, and don't commit it)
keytool -genkeypair -v -keystore freecell-release.jks -alias freecell -keyalg RSA -keysize 2048 -validity 36500

# 2. turn it into text
base64 -w0 freecell-release.jks                                   # Linux  (macOS: base64 -i freecell-release.jks)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("freecell-release.jks")) | Set-Clipboard   # Windows PowerShell
```

Then in the repo go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 text from step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `freecell` (the alias you used) |
| `ANDROID_KEY_PASSWORD` | the key password (leave out if it is the same as the keystore password) |

The same keystore can sign several apps, so you can reuse one you already have.

If the workflow cannot create the release, check **Settings → Actions → General → Workflow permissions** and allow *Read and write permissions*.

## Project layout

```
www/                 the game (this is what ends up in the APK)
  index.html  css/style.css  fonts/ (Fraunces, SIL OFL)
  js/rules.js        FreeCell rules, deal numbering, auto-move logic (pure, tested)
  js/solver.js       hint solver (weighted best-first search, runs in solver-worker.js)
  js/cards.js        suit shapes, pip layouts and face cards as SVG
  js/store.js        settings, saved game and statistics (localStorage), photo (IndexedDB)
  js/ui.js           board layout, dragging, hint highlights
  js/app.js          game flow, dialogs, undo, hints, statistics
android/             the Capacitor Android project (committed; `cap sync` refreshes the web copy)
tests/               node:test suites  (npm test)
tools/               serve.js (dev server), make-icons.js (regenerate icons), bench-solver.js
ci/debug.keystore    fallback signing key (see Signing)
```

### Common changes

- **App name**: `capacitor.config.json` (`appName`) and `android/app/src/main/res/values/strings.xml`.
- **App id** (`com.freecell.offline`): it appears in `capacitor.config.json`, `android/app/build.gradle` (`namespace`, `applicationId`) and in the Java package folder of `MainActivity.java`. Change it before your first release if you want your own id.
- **Icon**: edit the artwork in `tools/make-icons.js`, then `npm i --no-save sharp && node tools/make-icons.js`.
- **Plugins / Capacitor upgrades**: `npm install @capacitor/<plugin>`, run `npm run vendor` (refreshes `www/js/capacitor.js`, the script-tag build of Capacitor's core; a test fails if it is out of date), then `npx cap sync android` and commit the result.

### If a build fails

Open the failed run, expand the red step and look at the last 30 lines. The usual suspects: Gradle needing a newer JDK (the workflow uses 21, matching Capacitor 8), the workflow lacking write permission (see above), or a keystore secret that is not valid base64.
