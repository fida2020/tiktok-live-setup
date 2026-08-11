# F88 Live Overlay — Mobile Setup (Termux, no VPS/PC)

Ye guide us case ke liye hai jab poora `server.js` — control panel + overlay dono —
**seedha Android phone par Termux ke andar** chalana ho, VPS ya PC ke bina.

Phone hi backend (TikTok se connect, gift-scoring) aur dono web pages
(`control.html`, `overlay.html`) host karega.

---

## Kya chahiye

- Android phone (Termux ke liye Google Play wala build purana/broken hai —
  **F-Droid** se install karo: https://f-droid.org/packages/com.termux/)
- Wifi/data connection
- Agar overlay ko OBS ya TikTok LIVE Studio (kisi doosre PC/VPS) mein bhi
  dikhana hai, ek tunnel tool (neeche Step 6) — sirf tab chahiye jab overlay
  kisi doosri machine se access karna ho. Agar sab kuch isi phone par
  (control + streaming dono) ho raha hai to tunnel ki zaroorat nahi.

---

## Step 1 — Termux install aur update

F-Droid se Termux install karne ke baad, Termux kholo aur likho:

```
pkg update -y && pkg upgrade -y
```

## Step 2 — Node.js install karo

```
pkg install -y nodejs-lts git nano
node -v
```

Version number (v18+) dikhna chahiye.

## Step 3 — Project phone par lao

Agar ye project GitHub repo (`tiktok-live-setup`) mein hai:

```
cd ~
git clone https://github.com/fida2020/tiktok-live-setup.git
cd tiktok-live-setup/f88-live-overlay
```

Agar sirf zip file phone par hai (Downloads folder mein), Termux ko storage
access do aur wahan se copy karo:

```
termux-setup-storage
cp -r /storage/emulated/0/Download/f88-live-overlay ~/f88-live-overlay
cd ~/f88-live-overlay
```

## Step 4 — Dependencies install + `.env` banao

```
npm install
cp .env.example .env
nano .env
```

`.env` file mein:
```
TIKTOK_USERNAME=apka_tiktok_username
PORT=3000
```
(Bina `@` ke, sirf username.) Save karne ke liye `nano` mein `Ctrl+O`, `Enter`, phir `Ctrl+X`.

## Step 5 — Server chalao

```
npm start
```

Terminal mein dikhega:
```
Overlay: http://localhost:3000/overlay.html
Control panel: http://localhost:3000/control.html
```

Phone ke Chrome browser mein `http://localhost:3000/control.html` khol kar
guests add/round manage karo — sab isi phone par.

**Zaroori:** jab tak live ho, Termux app background mein chalte rehna chahiye.
Isi Termux session mein likho (naya split/session me nahi, chalte hue server
wale hi session mein `Ctrl+Z` mat karo — server ko chalta hi rehne do,
sirf app switch karo):

```
termux-wake-lock
```

Ye Android ko phone sleep hote hi Termux process kill karne se rokta hai.
Phone ki **Battery settings → Termux → Unrestricted / No battery optimization**
bhi on karo (Settings app mein, Android version ke hisaab se naam alag ho sakta hai) —
warna Android kuch minutes mein Termux ko background mein maar dega aur server
band ho jayega.

## Step 6 — (Sirf agar overlay kisi doosri machine/OBS mein dikhana ho)

Agar `overlay.html` ko kisi doosre PC/VPS par OBS ya TikTok LIVE Studio ke
Browser/Web Source mein daalna hai (jaise VPS wale setup mein), to phone ka
`localhost:3000` doosri machine se seedha reach nahi hoga (mobile data/wifi
ke peeche NAT hota hai). Iske liye ek tunnel chahiye — sabse aasaan **ngrok**:

```
pkg install -y wget
```

Phir https://ngrok.com se free account bana kar apna authtoken lo, aur
[ngrok ka Termux/Linux ARM build](https://ngrok.com/download) download karke
setup karo. Server chalte hue, doosre Termux session mein (naya session:
swipe se hamburger menu → New session):

```
ngrok http 3000
```

Ngrok jo `https://xxxx.ngrok-free.app` URL dega, uske aage `/overlay.html`
laga kar OBS/TikTok LIVE Studio ke Web Source mein daal do:
```
https://xxxx.ngrok-free.app/overlay.html
```

Free ngrok URL har restart pe badalta hai — har live se pehle naya URL
copy karke Browser Source update karna hoga (ya paid ngrok/Cloudflare Tunnel
se fixed subdomain use karo).

---

## Roz ka istemal (setup ke baad)

Har live se pehle sirf:
```
cd ~/tiktok-live-setup/f88-live-overlay   # (ya jahan bhi rakha hai)
termux-wake-lock
npm start
```
Agar tunnel bhi chahiye (Step 6), doosre session mein `ngrok http 3000` bhi chalao.

`npm install` aur `.env` sirf pehli baar karna tha.

## Project update karna (jab bhi naya code aaye)

Jab bhi overlay/server.js mein changes hon (jaise ye repo update hoti hai),
phone par sirf itna chalao — `.env` file safe rehti hai, dobara banane ki
zaroorat nahi:

```
cd ~/tiktok-live-setup
git pull origin claude/project-ko-mobile-setup-1u5fta
cd f88-live-overlay
npm install
```

(`npm install` sirf tab zaroori hai jab `package.json`/`package-lock.json`
change hui ho — baaki har baar `git pull` hi kaafi hai.)

---

## Termux-specific dikkatein

- **"npm install" fail ho raha hai / native build error** — is project
  (`server.js`) ke dependencies (`express`, `ws`, `dotenv`, `tiktok-live-connector`)
  sab pure JavaScript hain, koi native/compiled module nahi — Termux par bina
  `build-essential`/`clang` ke bhi chalne chahiye. Agar phir bhi error aaye,
  `pkg install -y clang make python` try karo phir dobara `npm install`.
- **Termux band ho jata hai screen off karte hi** — Step 5 ka `termux-wake-lock`
  aur battery-optimization-off dono zaroori hain.
- **Phone garam ho raha hai / data zyada use ho raha hai** — TikTok LIVE ka
  gift-listener connection halka hai (sirf events sunta hai), lekin agar
  ngrok tunnel bhi chala rahe ho to thoda extra data/battery lagega — jahan
  tak ho sake wifi par karo.
- **Sounds (win-dhol, gift-coin) nahi baj rahe** — `overlay.html` khulne ke
  baad ek baar us page pe tap karo (browser ka autoplay rule), jaise SETUP_GUIDE.md
  mein bataya gaya hai.
- Baaki sab troubleshooting (guest add error, "could not connect", etc.)
  `SETUP_GUIDE.md` ke "Agar kuch kaam na kare" section mein wahi hai — VPS ki
  jagah bas commands Termux mein chalao.
