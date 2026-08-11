# Live Match Overlay — Mobile Setup (Termux)

Is project ko `.env` ya TikTok login ki zaroorat nahi hai — koi live connection
nahi hai, sab manual buttons se chalta hai. Isliye setup `f88-live-overlay` se
bhi simple hai.

Agar `f88-live-overlay` ke liye pehle se Termux setup kar chuke hain (Node.js,
git already installed), to seedha Step 3 se shuru karein.

## Step 1 — Termux mein Node.js + git (agar pehle se nahi hai)

```
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git
```

## Step 2 — Project already clone ho chuka hai to update le lein

```
cd ~/tiktok-live-setup
git pull origin claude/project-ko-mobile-setup-1u5fta
```

(Agar clone hi nahi kiya, to `f88-live-overlay/SETUP_GUIDE_MOBILE.md` ke
Step 3 jaisa `git clone` command use karein.)

## Step 3 — Setup + run

```
cd ~/tiktok-live-setup/live-match-overlay
npm install
termux-wake-lock
npm start
```

Phone ke Chrome mein `http://localhost:3100/control.html` khol kar MVP/Level Up
animations trigger karein, aur `http://localhost:3100/overlay.html` jahan bhi
broadcasting software mein background ke tor par add karna hai wahan use karein.

**Yaad rahe:** jaisa `f88-live-overlay` ke saath discuss hua — `overlay.html`
sirf tab viewers ko dikhega jab koi broadcasting software (OBS / TikTok LIVE
Studio / RTMP app) ise camera ke upar compose kare. TikTok ki apni "Go LIVE"
app se seedha ye webpage show nahi hoti.
