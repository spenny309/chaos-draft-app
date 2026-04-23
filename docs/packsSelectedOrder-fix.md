# packsSelectedOrder Fix

Add `packsSelectedOrder` as an **array** field on each draft document in Firestore.
Each item is a **map** with three string fields: `id`, `name`, `imageUrl`.

---

## Draft 1 — November 8, 2025

| # | id | name | imageUrl |
|---|-----|------|----------|
| 0 | `2WrhfsJpuMFRZ4Dy5CTC` | Battle for Zendikar Booster | `https://tcgplayer-cdn.tcgplayer.com/product/102716_in_1000x1000.jpg` |
| 1 | `5RWg0XEwl4whx4kf7paf` | 2012 Core Set Booster | `https://tcgplayer-cdn.tcgplayer.com/product/46956_in_1000x1000.jpg` |
| 2 | `KvtYVyjaPsnjzTwJXXtv` | Modern Horizons 2 Draft | `https://tcgplayer-cdn.tcgplayer.com/product/236356_in_1000x1000.jpg` |
| 3 | `oC7zCVoFgQoGTOhnJiW3` | Born of the Gods Booster | `https://tcgplayer-cdn.tcgplayer.com/product/77982_in_1000x1000.jpg` |
| 4 | `rpPOOWx0yogCQsErmN3P` | Core Set 2020 Booster | `https://tcgplayer-cdn.tcgplayer.com/product/188211_in_1000x1000.jpg` |
| 5 | `uRDprCDIQO9LvHB4YMGY` | Adventures in the Forgotten Realms Draft | `https://tcgplayer-cdn.tcgplayer.com/product/238731_in_1000x1000.jpg` |
| 6 | `UJyl5wTB1xt3lKWs7QXB` | Guilds of Ravnica Booster | `https://tcgplayer-cdn.tcgplayer.com/product/173364_in_1000x1000.jpg` |
| 7 | `P1FTSRS2NQLyriRCF9pY` | Ultimate Masters Booster | `https://cdn11.bigcommerce.com/s-vwb3hwm6im/images/stencil/1280x1280/products/4583/3947/original__67301.1631043943.png?c=1` |
| 8 | `zl9nsBTHiF3OrGBPVIaE` | Aetherdrift Play | `https://tcgplayer-cdn.tcgplayer.com/product/604249_in_1000x1000.jpg` |
| 9 | `9IuqQD7jlZUQ22Uc4syO` | Kamigawa: Neon Dynasty Draft | `https://tcgplayer-cdn.tcgplayer.com/product/257556_in_1000x1000.jpg` |
| 10 | `YaWfi2ku4wZ4WBbAK3MP` | Shadowmoor Booster | `https://tcgplayer-cdn.tcgplayer.com/product/27368_in_1000x1000.jpg` |
| 11 | `q7V6GJuThj1fawbUYkTL` | Core Set 2021 Booster | `https://tcgplayer-cdn.tcgplayer.com/product/214813_in_1000x1000.jpg` |

---

## Draft 2 — January 18, 2026

| # | id | name | imageUrl |
|---|-----|------|----------|
| 0 | `78lpyp9WhMgsvdYBU3qg` | Lorwyn Eclipsed Play | `https://tcgplayer-cdn.tcgplayer.com/product/656311_in_1000x1000.jpg` |
| 1 | `zl9nsBTHiF3OrGBPVIaE` | Aetherdrift Play | `https://tcgplayer-cdn.tcgplayer.com/product/604249_in_1000x1000.jpg` |
| 2 | `k4QU7XmIzaxo99G3Ock8` | Kaldheim Set | `https://tcgplayer-cdn.tcgplayer.com/product/228252_in_1000x1000.jpg` |
| 3 | `4fRnaqLQLCvT6PkNhqlQ` | Outlaws of Thunder Junction Play | `https://cdn.shoplightspeed.com/shops/636231/files/61463692/magic-the-gathering-magic-the-gathering-outlaws-of.jpg` |
| 4 | `JHOGbtWaCQxqROpdI6or` | Theros Booster | `https://tcgplayer-cdn.tcgplayer.com/product/70961_in_1000x1000.jpg` |
| 5 | `BEHmcwVbWFyjOW3ScmDM` | 2010 Core Set | `https://tcgplayer-cdn.tcgplayer.com/product/32530_in_1000x1000.jpg` |
| 6 | `2YH2tVOKvpuz5IzTExN7` | Theros Beyond Death Booster | `https://tcgplayer-cdn.tcgplayer.com/product/202299_in_1000x1000.jpg` |
| 7 | `lkrbOOzSuHzrMVLuYbIg` | Innistrad: Double Feature Draft | `https://tcgplayer-cdn.tcgplayer.com/product/255912_in_1000x1000.jpg` |
| 8 | `ZiEPIZ46yZRpOoMyZzp4` | Streets of New Capenna Draft | `https://tcgplayer-cdn.tcgplayer.com/product/264759_in_1000x1000.jpg` |
| 9 | `KYqa6Xc9z3hCK5JuiUZt` | Innistrad Remastered Play | `https://tcgplayer-cdn.tcgplayer.com/product/594669_in_1000x1000.jpg` |
| 10 | `x4TUqmgjo4AB3oYWpr36` | Final Fantasy Play | `https://tcgplayer-cdn.tcgplayer.com/product/618889_in_1000x1000.jpg` |
| 11 | `syaFgrdoNRplQWiyYjXP` | Phyrexia: All Will Be One Draft | `https://tcgplayer-cdn.tcgplayer.com/product/451868_in_1000x1000.jpg` |
| 12 | `TPj6olgtI9EAsXqq7own` | 6th Edition Booster | `https://m.media-amazon.com/images/I/91OtMDMYxhL._AC_UF894,1000_QL80_.jpg` |
| 13 | `ujDqknWthkgRDxULof1y` | The Brothers' War Draft | `https://tcgplayer-cdn.tcgplayer.com/product/282227_in_1000x1000.jpg` |
| 14 | `BAN0LFO4fMbO1NIhrn0H` | Avacyn Restored | `https://tcgplayer-cdn.tcgplayer.com/product/58056_in_1000x1000.jpg` |
| 15 | `hjP3zgjvXfGQwzSIQvup` | Dominaria United Draft | `https://tcgplayer-cdn.tcgplayer.com/product/275432_in_1000x1000.jpg` |
| 16 | `P1FTSRS2NQLyriRCF9pY` | Ultimate Masters Booster | `https://cdn11.bigcommerce.com/s-vwb3hwm6im/images/stencil/1280x1280/products/4583/3947/original__67301.1631043943.png?c=1` |
| 17 | `St1gpsx9fCT9RnafNFu4` | Commander Legends Draft | `https://tcgplayer-cdn.tcgplayer.com/product/221318_in_1000x1000.jpg` |
