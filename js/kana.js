/* Witch's Soup — katakana pronunciation guides for the English names, shown as ruby on the
   presentation board. These follow English pronunciation (ジャーマニー, not ドイツ). */
(function (global) {
  "use strict";
  const KANA = {
    // ingredients
    "Ant heads": "アント ヘッズ", "Ash": "アッシュ", "Beetles": "ビートルズ", "Black rose": "ブラック ローズ", "Bones": "ボーンズ",
    "Breath of dragon": "ブレス オブ ドラゴン", "Bubblegum": "バブルガム", "Candle wax": "キャンドル ワックス", "Centipede": "センティピード",
    "Cockroach": "コックローチ", "Crow feather": "クロウ フェザー", "Crystal shards": "クリスタル シャーズ", "Dandelion": "ダンデライオン",
    "Dirty socks": "ダーティー ソックス", "Dragon scale": "ドラゴン スケイル", "Dragonfly": "ドラゴンフライ", "Dream dust": "ドリーム ダスト",
    "Earwax": "イヤーワックス", "Ember": "エンバー", "Eyeball": "アイボール", "Fairy dust": "フェアリー ダスト", "Fairy wing": "フェアリー ウィング",
    "Firefly": "ファイアフライ", "Fish head": "フィッシュ ヘッド", "Fly eyeballs": "フライ アイボールズ", "Frogs legs": "フロッグズ レッグズ",
    "Ghost pepper": "ゴウスト ペッパー", "Ghost tears": "ゴウスト ティアーズ", "Goblin ear": "ゴブリン イヤー", "Graveyard moss": "グレイヴヤード モス",
    "Hairball": "ヘアボール", "Herbs": "ハーブズ", "Honeycomb": "ハニーコウム", "Insect": "インセクト", "Ivy": "アイヴィー", "Jelly": "ジェリー",
    "Jewel": "ジューエル", "Ladybug": "レイディバグ", "Lightning": "ライトニング", "Lizard tail": "リザード テイル", "Marshmallows": "マーシュメロウズ",
    "Mermaid tail": "マーメイド テイル", "Moldy cheese": "モウルディ チーズ", "Moth": "モス", "Mummy head": "マミー ヘッド", "Mushroom": "マッシュルーム",
    "Napkin": "ナプキン", "Newt": "ニュート", "Nose": "ノウズ", "Ogre ear": "オウガー イヤー", "Owl feather": "アウル フェザー",
    "Phoenix feather": "フィーニクス フェザー", "Pickle": "ピクル", "Piece of rainbow": "ピース オブ レインボウ", "Pumpkin seeds": "パンプキン シーズ",
    "Quail egg": "クウェイル エッグ", "Quartz": "クウォーツ", "Queen bee": "クウィーン ビー", "Rat tail": "ラット テイル", "Rose": "ロウズ",
    "Rotten apple": "ロトゥン アップル", "Scorpion": "スコーピオン", "Snail shell": "スネイル シェル", "Snake fangs": "スネイク ファングズ",
    "Spider eggs": "スパイダー エッグズ", "Thistle": "スィスル", "Toad juice": "トウド ジュース", "Toenail": "トウネイル", "Toothpaste": "トゥースペイスト",
    "Unicorn horn": "ユーニコーン ホーン", "Vampire teeth": "ヴァンパイア ティース", "Wings of bat": "ウィングズ オブ バット",
    "Witch fingers": "ウィッチ フィンガーズ", "Wolf fur": "ウルフ ファー", "Worms": "ワームズ", "Zebra stripes": "ズィーブラ ストライプス",
    "Zombie hand": "ゾンビ ハンド",
    // countries
    "Japan": "ジャパン", "America": "アメリカ", "Australia": "オーストレイリア", "Brazil": "ブラズィル", "Canada": "キャナダ", "China": "チャイナ",
    "France": "フランス", "Germany": "ジャーマニー", "India": "インディア", "Italy": "イタリー", "Korea": "コリーア", "Mexico": "メクスィコウ",
    "Spain": "スペイン", "Thailand": "タイランド", "The UK": "ザ ユーケー", "Vietnam": "ヴィエトナーム", "Egypt": "イージプト",
    "Ethiopia": "イースィオウピア", "Ghana": "ガーナ", "Kenya": "ケニア", "Morocco": "モラコウ", "Nigeria": "ナイジーリア",
    "South Africa": "サウス アフリカ", "Tunisia": "チューニージア", "Afghanistan": "アフギャニスタン", "Bangladesh": "バングラデシュ",
    "Indonesia": "インドニージア", "Iran": "イラーン", "Iraq": "イラーク", "Israel": "イズリエル", "Jordan": "ジョーダン",
    "Kazakhstan": "カザフスタン", "Lebanon": "レバノン", "Malaysia": "マレイジア", "Mongolia": "モンゴウリア", "Myanmar": "ミャンマー",
    "Nepal": "ネポール", "Pakistan": "パキスタン", "Philippines": "フィリピーンズ", "Saudi Arabia": "サウディ アレイビア",
    "Singapore": "スィンガポール", "Sri Lanka": "スリー ランカ", "Syria": "スィリア", "Taiwan": "タイワーン", "Turkey": "ターキー",
    "The UAE": "ザ ユーエーイー", "Uzbekistan": "ウズベキスタン", "Austria": "オーストリア", "Belgium": "ベルジャム", "Bulgaria": "バルゲリア",
    "Croatia": "クロウエイシャ", "Czech Republic": "チェック リパブリック", "Denmark": "デンマーク", "Finland": "フィンランド",
    "Greece": "グリース", "Hungary": "ハンガリー", "Iceland": "アイスランド", "Ireland": "アイアランド", "Netherlands": "ネザランズ",
    "Norway": "ノーウェイ", "Poland": "ポウランド", "Portugal": "ポーチュガル", "Romania": "ロウメイニア", "Russia": "ラシャ",
    "Sweden": "スウィードゥン", "Switzerland": "スウィッツァランド", "Ukraine": "ユークレイン", "Costa Rica": "コウスタ リーカ",
    "Cuba": "キューバ", "Guatemala": "グワテマーラ", "Jamaica": "ジャメイカ", "Panama": "パナマー", "Fiji": "フィージー",
    "New Zealand": "ニュー ズィーランド", "Argentina": "アージェンティーナ", "Bolivia": "ボリヴィア", "Chile": "チリ", "Colombia": "コロンビア",
    "Ecuador": "エクワドー", "Peru": "ペルー", "Uruguay": "ユーラグワイ", "Venezuela": "ヴェネズウェイラ"
  };
  global.kanaFor = (name) => KANA[name] || "";
  global.KANA = KANA;
})(window);
