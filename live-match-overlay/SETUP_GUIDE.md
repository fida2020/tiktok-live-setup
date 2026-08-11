# Live Match Overlay — Setup Guide

Ye ek standalone overlay hai — sirf ek **animated background** (stars, spotlight
beams, gold particles, curtains) jo aapki live match ke pichhe chalta rahega, plus
do **manually-triggered celebration animations**: **MVP** (naam + DP ke saath) aur
**Level Up** (number ke saath).

Koi TikTok LIVE connection nahi hai is mein — sab kuch control panel ke buttons se
manually chalta hai. Isliye ye kisi bhi live (chahe TikTok, chahe kahin aur) ke
saath, kisi bhi waqt, bina "actually live hone" ki zaroorat ke test kiya ja sakta hai.

## Step 1 — Setup (sirf ek baar)

```
cd live-match-overlay
npm install
```

## Step 2 — Chalana

```
npm start
```

Terminal mein do links dikhenge:
- **Overlay** (`http://localhost:3100/overlay.html`) — apni streaming software
  (OBS ya TikTok LIVE Studio) mein Browser/Web Source ke tor par add karo
- **Control panel** (`http://localhost:3100/control.html`) — apne browser mein
  khol kar isse animations trigger karo

## Control panel se kaise use karein

**MVP animation:**
1. TikTok username daalein (bina `@` ke)
2. "Fetch Profile" dabayein — real naam aur DP fetch hogi TikTok ke public
   profile se (koi login nahi chahiye)
3. "Show MVP" dabayein — overlay pe ~5.5 second ki animation chalegi

**Level Up animation:**
1. Level number (1-10) choose karein
2. "Show Level Up" dabayein — overlay pe ~4 second ki animation chalegi

## Zaroori

- `overlay.html` sirf viewers ko tab dikhega jab koi broadcasting software
  (OBS, TikTok LIVE Studio, ya RTMP-capable mobile app) camera ke upar compose
  kare — sirf TikTok ki apni "Go LIVE" app se khud is webpage ko show nahi kiya
  ja sakta (ye TikTok ki app ki limitation hai).
- MVP profile fetch TikTok ke public webpage se hoti hai (jaise
  `f88-live-overlay` mein) — agar TikTok apna page structure badal de to ye
  break ho sakta hai; is case mein bhi "Show MVP" DP ke bina, sirf naam ke
  pehle letter ke saath chal jayega.
