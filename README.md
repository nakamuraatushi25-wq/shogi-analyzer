# shogi-analyzer

棋譜（KIF）から戦法と囲いを自動判定するライブラリです。上達ソフトの分析エンジンの土台になります。
TypeScript で書いてあり、外部ライブラリは使っていないので、ブラウザでも Node でもそのまま動きます。

## 使い方

```sh
npm test                                   # テスト（Node 22.18 以上）
npm run classify -- path/to/games.kif      # 複数局の KIF を判定して一覧表示
```

```ts
import { parseKif } from './src/kif.ts';
import { classifyOpening } from './src/opening.ts';
const result = classifyOpening(parseKif(kifText));
// result.opening  例: "四間飛車 vs 居飛車持久戦" / "角換わり" / "矢倉（先手右四間飛車）"
```

## 判定ルール（すべてその側から見た座標）

- 飛車：40手目まで、かつ金銀以上の駒が初めて取られるまでに、飛車が最初に横へ動いた筋で決める。
  5筋＝中飛車、6筋＝四間、7筋＝三間（その後7六に上がれば石田流）、8筋＝向かい飛車、4筋＝右四間、3筋＝袖飛車。
  3四の歩を飛車で取った場合は横歩取り。
- 角交換：30手目までに両者が角（馬）を取ったら角交換。
- 囲い：金銀以上の駒が初めて取られる直前（遅くとも60手目）の局面で、玉と金銀の位置から判定する。
  穴熊、矢倉（金矢倉・菊水矢倉）、左美濃、銀冠、高美濃、本美濃、片美濃、カニ囲い、舟囲い、居玉。
- 対抗形の居飛車側は、穴熊・矢倉・美濃系なら「持久戦」、それ以外は「急戦」。
- 相居飛車は、横歩取り → 角換わり → 矢倉 → 雁木 → 相掛かり の順で判定する。

## lishogi からの棋譜収集（scripts/collect-lishogi.ts）

手元の PC で実行します。種にする対局者から始めて、対戦相手をたどって集めます。

```sh
node scripts/collect-lishogi.ts --seeds KEN0057,mikan33 --players 50 --games 200 --out data/lishogi
```

- 集めるのは平手のレート戦で、終局まで指された局だけです。BOT、利用停止中の人、レート戦が20局未満の人は飛ばします。
- リクエストは1件ずつ、1秒おきに送ります。429 が返ったら60秒待ってからやり直します。
- 棋譜は `data/lishogi/players/<名前>.kif` に、進み具合は `data/lishogi/state.json` に保存します。同じ `--out` でもう一度実行すると、続きから再開します。
- `data/` は git に入れません。
