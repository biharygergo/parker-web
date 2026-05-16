# Parker Web

Egyszerű, térképes webalkalmazás a Parker utcai parkolószenzor-adatainak megjelenítésére.

## Futtatás

```sh
export PARKER_AUTHORIZATION=your-token
npm run dev
```

Ezután nyisd meg: [http://localhost:3000](http://localhost:3000).

## API proxy

A böngésző a helyi `/api/sensors` végpontot hívja:

```text
/api/sensors?lat=47.51551463432745&lng=19.050964125951115&radius_meters=360
```

A helyi szerver ezt a kérést ide továbbítja:

```text
https://parker-proxy.codeandsoda.hu/sensors
```

A Parker jogosultsági fejlécet a szerver küldi tovább, így a token nem kerül a böngészőkódba. Helyi futtatás előtt állítsd be a tokent:

```sh
PARKER_AUTHORIZATION=your-token npm run dev
```

Ha az élő API nem elérhető, a felület demo adatokat jelenít meg a minta válaszformátum alapján, így a térkép helyi fejlesztés közben is használható marad.

## Vercel telepítés

Ez a repo Vercel-kompatibilis:

- A `public/` a statikus kimeneti könyvtár.
- Az `api/sensors.js` a Vercel Function, amely proxyn keresztül hívja a Parker API-t.
- A `vercel.json` beállítja, hogy a Vercel a `public/` könyvtárat szolgálja ki telepítési kimenetként.

Telepítés előtt állítsd be a `PARKER_AUTHORIZATION` környezeti változót a Vercel Project Settings felületén.
