# F88 Live Overlay — Setup Guide (VPS Edition)

## Kya karna hai, sirf 4 cheezein:
1. Ye poora folder VPS pe copy/upload karo
2. Terminal mein 3 commands chalao (ek baar setup, phir hamesha)
3. `.env` file mein apna TikTok username daalo
4. Har live se pehle server chalao, TikTok LIVE Studio mein overlay add karo

---

## Step 1 — Confirm Node.js (already installed hai VPS pe)

VPS ke terminal mein:
```
node -v
```
Version number aana chahiye (v18 ya usse upar). Agar error aaye, https://nodejs.org se LTS version install karo.

## Step 2 — Project setup (sirf ek baar)

Is poore `f88-live-overlay` folder ko VPS pe kisi jagah rakho (jaise `C:\f88-live-overlay` ya `Desktop\f88-live-overlay`).

Terminal mein us folder ke andar jao, phir:
```
npm install
```

Phir `.env.example` file ka naam badal ke `.env` kar do, aur usme apna TikTok username daal do:
```
TIKTOK_USERNAME=apka_tiktok_username
```
(Bina `@` ke, sirf username.)

## Step 3 — Har baar live jaane se pehle

1. VPS ke terminal mein is folder ke andar ja kar likho:
   ```
   npm start
   ```
   Terminal khula rehne dena jab tak live ho.

2. Terminal mein ek link dikhega: `http://localhost:3000/control.html` — VPS ke andar hi browser mein khol lo, isi se guests add/drop aur round start/end karoge.

3. **TikTok LIVE Studio kholo (VPS ke andar)** → naya scene banao → **Web Source (ya Link Source)** add karo → URL mein daalo:
   ```
   http://localhost:3000/overlay.html
   ```
   Width: 1080, Height: 1920 (ya apni stream resolution ke hisaab se) → OK.

4. **Mic:** apna existing Moonlight/Sunshine + VB-Cable setup jaisa raat ko test kiya tha, wahi use karo — TikTok LIVE Studio mein mic source usi VB-Cable output pe set karo.

5. **Audio unlock:** overlay khulne ke baad, ek baar us overlay window/source pe click ya koi bhi key dabao (browser ka autoplay rule) — taake sounds (win-dhol, gift-coin) kaam karein.

6. TikTok pe live jao, guests join karein, control panel se unko add karo, "Start Round" dabao — sab automatic chalega.

## Roz ka istemal (setup ke baad)

Har live se pehle sirf:
```
npm start
```
chalana hai — baaki (npm install, .env) sirf ek baar karna tha.

## Zaroori files check-list (sab is folder mein hone chahiye)

```
f88-live-overlay/
├── server.js              ← backend, TikTok se connect hota hai
├── package.json
├── .env                   ← apna username isme daalo (.env.example se banaya)
└── public/
    ├── overlay.html        ← OBS/TikTok Studio mein add karne wali file
    ├── control.html         ← guests/round manage karne ke liye
    └── sounds/
        ├── win-dhol.mp3
        └── gift-coin.mp3
```

**Zaroori:** `sounds/` folder `public/` ke andar hi rehna chahiye, warna sounds nahi bajenge (relative path hai).

## Agar kuch kaam na kare

- **"Could not connect — are you live right now?"** → pehle TikTok pe actually live jao, phir `npm start` chalao (ya `Ctrl+C` se rok ke dobara `npm start`)
- **Control panel "Disconnected" dikhaye** → check karo `npm start` abhi bhi chal raha hai
- **Sounds na bajein** → overlay source pe ek baar click karo (autoplay rule); `sounds/` folder sahi jagah check karo
- **Guest add karne pe error** → username sahi check karo; TikTok apna page structure badal chuka ho to guest phir bhi add ho jayega, DP baad mein khud aa jayegi
- **Mic VPS tak nahi pahunch raha** → Moonlight/Sunshine/VB-Cable chain dobara check karo, jaisa pehle test kiya tha
