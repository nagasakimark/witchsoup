/* =====================================================================
   My Magic Soup — game data + brewing rules.
   Plain global script (no modules) so the app runs from a static host.
   The bottom of this file exports for Node so rules can be unit-tested.
   ===================================================================== */

// ---------- element "powers" ------------------------------------------------
// Every ingredient has a primary power (worth 2) and a secondary one (worth 1).
// The strongest power in the pot decides which potion you brew.
const TAGS = {
  fire:    { emoji: "🔥", name: "Fire",    nameJa: "ほのお",   color: "#ff6a1f" },
  water:   { emoji: "💧", name: "Water",   nameJa: "みず",     color: "#2f9bff" },
  ice:     { emoji: "❄️", name: "Ice",     nameJa: "こおり",   color: "#79e2ff" },
  earth:   { emoji: "⛰️", name: "Earth",   nameJa: "だいち",   color: "#b4743a" },
  wind:    { emoji: "🌀", name: "Wind",    nameJa: "かぜ",     color: "#a8f0d8" },
  thunder: { emoji: "⚡", name: "Thunder", nameJa: "かみなり", color: "#ffe51f" },
  light:   { emoji: "☀️", name: "Light",   nameJa: "ひかり",   color: "#ffe27a" },
  dark:    { emoji: "🌑", name: "Dark",    nameJa: "やみ",     color: "#7a45c9" },
  life:    { emoji: "🌱", name: "Life",    nameJa: "いのち",   color: "#5fdc4a" },
  heal:    { emoji: "❤️", name: "Healing", nameJa: "かいふく", color: "#ff5a7a" },
  magic:   { emoji: "🔮", name: "Magic",   nameJa: "まほう",   color: "#a35cff" },
  psychic: { emoji: "👁️", name: "Psychic", nameJa: "ちょうのうりょく", color: "#e24fd2" },
  luck:    { emoji: "🍀", name: "Luck",    nameJa: "こううん", color: "#2fd06b" },
  sleep:   { emoji: "💤", name: "Sleep",   nameJa: "ねむり",   color: "#5a6cf0" },
  speed:   { emoji: "💨", name: "Speed",   nameJa: "スピード", color: "#37e1d2" },
  strong:  { emoji: "💪", name: "Strength", nameJa: "ちから",  color: "#e24a4a" },
  shield:  { emoji: "🛡️", name: "Shield",  nameJa: "まもり",   color: "#aab8d4" }
};
const TAG_ORDER = Object.keys(TAGS);

// ---------- ingredients ---------------------------------------------------
function ing(name, letter, nameJa, furigana, descriptionJa, tags, color) {
  const parts = tags.split(" ");
  const id = name.toLowerCase().replace(/\s+/g, "-");
  return {
    id, name, letter, nameJa, furigana, descriptionJa,
    tags: parts,
    primary: parts[0],
    secondary: parts[1],
    color,
    image: `assets/ingredients/${id}.webp`
  };
}

const INGREDIENTS = [
  // A
  ing("Ant heads", "A", "アリの頭", "あたま", "小さいけど強い魔法の力を持つアリの頭です。", "strong earth", "#8c4a2b"),
  ing("Ash", "A", "灰", "はい", "燃えた後に残る魔法の灰です。", "earth fire", "#8a8a96"),

  // B
  ing("Beetles", "B", "カブトムシ", "かぶとむし", "硬い殻を持つ魔法の虫です。", "shield earth", "#7a3f2a"),
  ing("Black rose", "B", "黒いバラ", "くろいばら", "呪われた黒いバラのトゲです。", "dark magic", "#3b2358"),
  ing("Bones", "B", "骨", "ほね", "古い魔法の力が宿る骨です。", "dark shield", "#e5ddc8"),
  ing("Breath of dragon", "B", "ドラゴンの息", "いき", "ドラゴンが吐く魔法の息です。", "fire wind", "#ff5a1f"),
  ing("Bubblegum", "B", "ガム", "がむ", "魔法の力を持つ不思議なガムです。", "wind luck", "#ff55a8"),

  // C
  ing("Candle wax", "C", "ろうそくのロウ", "ろう", "魔法のろうそくから取れるロウです。", "light fire", "#ffd24a"),
  ing("Centipede", "C", "ムカデ", "むかで", "たくさんの足を持つ魔法の虫です。", "speed earth", "#d6804a"),
  ing("Cockroach", "C", "ゴキブリ", "ごきぶり", "とても強い生命力を持つ虫です。", "shield strong", "#7b4326"),
  ing("Crow feather", "C", "カラスの羽", "はね", "黒いカラスの魔法の羽です。", "wind psychic", "#343a5c"),
  ing("Crystal shards", "C", "水晶のかけら", "すいしょう", "キラキラ光る魔法の水晶です。", "ice light", "#b9a2ff"),

  // D
  ing("Dandelion", "D", "タンポポ", "たんぽぽ", "願いを運ぶ魔法の綿毛です。", "wind luck", "#ffd83a"),
  ing("Dirty socks", "D", "汚れた靴下", "よごれたくつした", "不思議な力を持つ古い靴下です。", "sleep thunder", "#b08a5c"),
  ing("Dragon scale", "D", "ドラゴンの鱗", "うろこ", "ドラゴンの体を守る硬い鱗です。", "shield fire", "#3fc7bd"),
  ing("Dragonfly", "D", "トンボ", "とんぼ", "速く飛ぶ魔法のトンボです。", "speed wind", "#e3a63a"),
  ing("Dream dust", "D", "夢の粉", "ゆめのこな", "夢を見せてくれる魔法の粉です。", "sleep magic", "#8fb4ff"),

  // E
  ing("Earwax", "E", "耳あか", "みみあか", "不思議な力を持つ耳あかです。", "psychic earth", "#f2c24d"),
  ing("Ember", "E", "燃えさし", "もえさし", "まだ燃えている魔法の炭です。", "fire light", "#ff7b1c"),
  ing("Eyeball", "E", "目玉", "めだま", "魔法の力を持つ目玉です。", "psychic light", "#d6405a"),

  // F
  ing("Fairy dust", "F", "妖精の粉", "ようせいのこな", "キラキラ光る妖精の魔法の粉です。", "magic light", "#e79bff"),
  ing("Fairy wing", "F", "妖精の羽", "ようせいのはね", "透明で美しい妖精の羽です。", "magic wind", "#7f66ff"),
  ing("Firefly", "F", "ホタル", "ほたる", "光る魔法のホタルです。", "thunder light", "#fff07a"),
  ing("Fish head", "F", "魚の頭", "さかなのあたま", "海の魔法を持つ魚の頭です。", "water earth", "#4a8fe0"),
  ing("Fly eyeballs", "F", "ハエの目", "はえのめ", "たくさんの目を持つハエの目玉です。", "psychic speed", "#b8405e"),
  ing("Frogs legs", "F", "カエルの足", "かえるのあし", "ジャンプする力を持つカエルの足です。", "water speed", "#55c24a"),

  // G
  ing("Ghost pepper", "G", "ゴーストペッパー", "ごーすとぺっぱー", "とても辛い幽霊の唐辛子です。", "fire strong", "#ff3524"),
  ing("Ghost tears", "G", "幽霊の涙", "ゆうれいのなみだ", "幽霊が泣いた時の涙です。", "ice water", "#86dcff"),
  ing("Goblin ear", "G", "ゴブリンの耳", "みみ", "とがった耳を持つゴブリンの耳です。", "psychic strong", "#62cf5a"),
  ing("Graveyard moss", "G", "墓場の苔", "はかばのこけ", "お墓に生える魔法の苔です。", "life ice", "#4f9440"),

  // H
  ing("Hairball", "H", "毛玉", "けだま", "動物の毛が集まった魔法の毛玉です。", "sleep earth", "#7b5a38"),
  ing("Herbs", "H", "薬草", "やくそう", "魔法の力を持つ不思議な草です。", "life heal", "#62c75a"),
  ing("Honeycomb", "H", "ハチの巣", "はちのす", "甘い蜜が入ったハチの巣です。", "heal strong", "#ffb42b"),

  // I
  ing("Insect", "I", "虫", "むし", "小さいけど強い魔法の虫です。", "speed life", "#67d44a"),
  ing("Ivy", "I", "ツタ", "つた", "どんどん伸びる魔法のツタです。", "life shield", "#3fae4e"),

  // J
  ing("Jelly", "J", "ゼリー", "ぜりー", "プルプル揺れる魔法のゼリーです。", "heal shield", "#ff3d62"),
  ing("Jewel", "J", "宝石", "ほうせき", "キラキラ光る魔法の宝石です。", "light luck", "#3fd0ff"),

  // L
  ing("Ladybug", "L", "テントウムシ", "てんとうむし", "赤くて可愛い魔法の虫です。", "luck light", "#ee4a4a"),
  ing("Lightning", "L", "稲妻", "いなずま", "空から落ちる魔法の雷です。", "thunder speed", "#ffe21a"),
  ing("Lizard tail", "L", "トカゲの尻尾", "とかげのしっぽ", "切れても生えてくるトカゲの尻尾です。", "life speed", "#45c24d"),

  // M
  ing("Marshmallows", "M", "マシュマロ", "ましゅまろ", "ふわふわの魔法のお菓子です。", "heal sleep", "#ffd9e8"),
  ing("Mermaid tail", "M", "人魚の尾", "にんぎょのお", "キラキラ光る人魚の尻尾です。", "water magic", "#2bd8aa"),
  ing("Moldy cheese", "M", "カビたチーズ", "かびたちーず", "古くなった魔法のチーズです。", "earth sleep", "#cfae4a"),
  ing("Moth", "M", "蛾", "が", "夜に飛ぶ魔法の蛾です。", "wind light", "#dcbcff"),
  ing("Mummy head", "M", "ミイラの頭", "みいらのあたま", "包帯で巻かれた古いミイラの頭です。", "shield sleep", "#d9d0a8"),
  ing("Mushroom", "M", "キノコ", "きのこ", "不思議な力を持つ魔法のキノコです。", "luck life", "#ea4545"),

  // N
  ing("Napkin", "N", "ナプキン", "なぷきん", "魔法の力を持つ布です。", "heal shield", "#4fd2b4"),
  ing("Newt", "N", "イモリ", "いもり", "水辺に住む魔法のイモリです。", "water ice", "#2f5bb8"),
  ing("Nose", "N", "鼻", "はな", "魔法の力を持つ鼻です。", "psychic wind", "#f2a889"),

  // O
  ing("Ogre ear", "O", "オーガの耳", "おーがのみみ", "大きな怪物オーガの耳です。", "strong earth", "#78c447"),
  ing("Owl feather", "O", "フクロウの羽", "ふくろうのはね", "賢いフクロウの魔法の羽です。", "psychic wind", "#cdb590"),

  // P
  ing("Phoenix feather", "P", "不死鳥の羽", "ふしちょうのはね", "燃えても生き返る不死鳥の羽です。", "fire heal", "#ff6b1f"),
  ing("Pickle", "P", "ピクルス", "ぴくるす", "すっぱくてシャキシャキの魔法のきゅうりです。", "life water", "#78a02c"),
  ing("Piece of rainbow", "P", "虹のかけら", "にじのかけら", "七色に光る虹のかけらです。", "light luck", "#ffa85a"),
  ing("Pumpkin seeds", "P", "カボチャの種", "かぼちゃのたね", "魔法のカボチャの種です。", "earth light", "#e8c680"),

  // Q
  ing("Quail egg", "Q", "うずらの卵", "うずらのたまご", "小さくて模様がかわいい卵です。", "luck heal", "#eadbb2"),
  ing("Quartz", "Q", "水晶", "すいしょう", "透明で美しい魔法の水晶です。", "ice shield", "#9ccdff"),
  ing("Queen bee", "Q", "女王蜂", "じょおうばち", "ハチの巣を守る女王様のハチです。", "thunder magic", "#ffd500"),

  // R
  ing("Rat tail", "R", "ネズミの尻尾", "ねずみのしっぽ", "長くて細いネズミの尻尾です。", "speed thunder", "#dca7a7"),
  ing("Rose", "R", "バラ", "ばら", "美しい魔法のバラの花です。", "heal magic", "#e4224f"),
  ing("Rotten apple", "R", "腐ったリンゴ", "くさったりんご", "古くなって腐ったリンゴです。", "sleep water", "#9a3f2c"),

  // S
  ing("Scorpion", "S", "サソリ", "さそり", "毒を持つ危険なサソリです。", "strong fire", "#b8783a"),
  ing("Snail shell", "S", "カタツムリの殻", "かたつむりのから", "グルグル巻きのカタツムリの殻です。", "earth shield", "#ffa23d"),
  ing("Snake fangs", "S", "ヘビの牙", "へびのきば", "毒を持つヘビの鋭い牙です。", "strong sleep", "#f1f1f1"),
  ing("Spider eggs", "S", "クモの卵", "くものたまご", "たくさんのクモが生まれる卵です。", "dark psychic", "#d6d6d6"),

  // T
  ing("Thistle", "T", "アザミ", "あざみ", "トゲのある魔法の植物です。", "shield life", "#b650cf"),
  ing("Toad juice", "T", "ヒキガエルの汁", "ひきがえるのしる", "ヒキガエルから取れる魔法の液です。", "water life", "#7fe44f"),
  ing("Toenail", "T", "足の爪", "あしのつめ", "魔法の力を持つ足の爪です。", "strong earth", "#f6cba4"),
  ing("Toothpaste", "T", "歯磨き粉", "はみがきこ", "ミントの香りがする歯磨き粉です。", "ice heal", "#72f2e2"),

  // U
  ing("Unicorn horn", "U", "ユニコーンの角", "ゆにこーんのつの", "純粋な心を持つユニコーンの角です。", "magic heal", "#ffbdf5"),

  // V
  ing("Vampire teeth", "V", "吸血鬼の牙", "きゅうけつきのきば", "血を吸う吸血鬼の鋭い牙です。", "dark strong", "#b8123a"),

  // W
  ing("Wings of bat", "W", "コウモリの翼", "こうもりのつばさ", "夜に飛ぶコウモリの翼です。", "dark wind", "#3d4d70"),
  ing("Witch fingers", "W", "魔女の指", "まじょのゆび", "魔法を使う魔女の長い指です。", "magic dark", "#55d474"),
  ing("Wolf fur", "W", "オオカミの毛", "おおかみのけ", "フサフサしたオオカミの毛です。", "thunder strong", "#a9a9b4"),
  ing("Worms", "W", "ミミズ", "みみず", "土の中に住むミミズです。", "earth life", "#ff9fb6"),

  // Z
  ing("Zebra stripes", "Z", "シマウマの縞", "しまうまのしま", "白と黒のシマウマの模様です。", "luck speed", "#ececf4"),
  ing("Zombie hand", "Z", "ゾンビの手", "ぞんびのて", "腐ったゾンビの手です。", "dark ice", "#70ad63"),
];
const INGREDIENT_BY_ID = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
const LETTERS = Array.from(new Set(INGREDIENTS.map((i) => i.letter))).sort();

// ---------- countries -----------------------------------------------------
const CONTINENTS = [
  { id: "asia",         name: "Asia",          nameJa: "アジア" },
  { id: "europe",       name: "Europe",        nameJa: "ヨーロッパ" },
  { id: "africa",       name: "Africa",        nameJa: "アフリカ" },
  { id: "northamerica", name: "North America", nameJa: "北アメリカ" },
  { id: "southamerica", name: "South America", nameJa: "南アメリカ" },
  { id: "oceania",      name: "Oceania",       nameJa: "オセアニア" }
];
const COUNTRY_LIST = [  { id: "japan", name: "Japan", nameJa: "日本", code: "jp", continent: "asia" },
  { id: "america", name: "America", nameJa: "アメリカ", code: "us", continent: "northamerica" },
  { id: "australia", name: "Australia", nameJa: "オーストラリア", code: "au", continent: "oceania" },
  { id: "brazil", name: "Brazil", nameJa: "ブラジル", code: "br", continent: "southamerica" },
  { id: "canada", name: "Canada", nameJa: "カナダ", code: "ca", continent: "northamerica" },
  { id: "china", name: "China", nameJa: "中国", code: "cn", continent: "asia" },
  { id: "france", name: "France", nameJa: "フランス", code: "fr", continent: "europe" },
  { id: "germany", name: "Germany", nameJa: "ドイツ", code: "de", continent: "europe" },
  { id: "india", name: "India", nameJa: "インド", code: "in", continent: "asia" },
  { id: "italy", name: "Italy", nameJa: "イタリア", code: "it", continent: "europe" },
  { id: "korea", name: "Korea", nameJa: "韓国", code: "kr", continent: "asia" },
  { id: "mexico", name: "Mexico", nameJa: "メキシコ", code: "mx", continent: "northamerica" },
  { id: "spain", name: "Spain", nameJa: "スペイン", code: "es", continent: "europe" },
  { id: "thailand", name: "Thailand", nameJa: "タイ", code: "th", continent: "asia" },
  { id: "uk", name: "The UK", nameJa: "イギリス", code: "gb", continent: "europe" },
  { id: "vietnam", name: "Vietnam", nameJa: "ベトナム", code: "vn", continent: "asia" },
  { id: "egypt", name: "Egypt", nameJa: "エジプト", code: "eg", continent: "africa" },
  { id: "ethiopia", name: "Ethiopia", nameJa: "エチオピア", code: "et", continent: "africa" },
  { id: "ghana", name: "Ghana", nameJa: "ガーナ", code: "gh", continent: "africa" },
  { id: "kenya", name: "Kenya", nameJa: "ケニア", code: "ke", continent: "africa" },
  { id: "morocco", name: "Morocco", nameJa: "モロッコ", code: "ma", continent: "africa" },
  { id: "nigeria", name: "Nigeria", nameJa: "ナイジェリア", code: "ng", continent: "africa" },
  { id: "southafrica", name: "South Africa", nameJa: "南アフリカ", code: "za", continent: "africa" },
  { id: "tunisia", name: "Tunisia", nameJa: "チュニジア", code: "tn", continent: "africa" },
  { id: "afghanistan", name: "Afghanistan", nameJa: "アフガニスタン", code: "af", continent: "asia" },
  { id: "bangladesh", name: "Bangladesh", nameJa: "バングラデシュ", code: "bd", continent: "asia" },
  { id: "indonesia", name: "Indonesia", nameJa: "インドネシア", code: "id", continent: "asia" },
  { id: "iran", name: "Iran", nameJa: "イラン", code: "ir", continent: "asia" },
  { id: "iraq", name: "Iraq", nameJa: "イラク", code: "iq", continent: "asia" },
  { id: "israel", name: "Israel", nameJa: "イスラエル", code: "il", continent: "asia" },
  { id: "jordan", name: "Jordan", nameJa: "ヨルダン", code: "jo", continent: "asia" },
  { id: "kazakhstan", name: "Kazakhstan", nameJa: "カザフスタン", code: "kz", continent: "asia" },
  { id: "lebanon", name: "Lebanon", nameJa: "レバノン", code: "lb", continent: "asia" },
  { id: "malaysia", name: "Malaysia", nameJa: "マレーシア", code: "my", continent: "asia" },
  { id: "mongolia", name: "Mongolia", nameJa: "モンゴル", code: "mn", continent: "asia" },
  { id: "myanmar", name: "Myanmar", nameJa: "ミャンマー", code: "mm", continent: "asia" },
  { id: "nepal", name: "Nepal", nameJa: "ネパール", code: "np", continent: "asia" },
  { id: "pakistan", name: "Pakistan", nameJa: "パキスタン", code: "pk", continent: "asia" },
  { id: "philippines", name: "Philippines", nameJa: "フィリピン", code: "ph", continent: "asia" },
  { id: "saudiarabia", name: "Saudi Arabia", nameJa: "サウジアラビア", code: "sa", continent: "asia" },
  { id: "singapore", name: "Singapore", nameJa: "シンガポール", code: "sg", continent: "asia" },
  { id: "srilanka", name: "Sri Lanka", nameJa: "スリランカ", code: "lk", continent: "asia" },
  { id: "syria", name: "Syria", nameJa: "シリア", code: "sy", continent: "asia" },
  { id: "taiwan", name: "Taiwan", nameJa: "台湾", code: "tw", continent: "asia" },
  { id: "turkey", name: "Turkey", nameJa: "トルコ", code: "tr", continent: "asia" },
  { id: "uae", name: "The UAE", nameJa: "UAE", code: "ae", continent: "asia" },
  { id: "uzbekistan", name: "Uzbekistan", nameJa: "ウズベキスタン", code: "uz", continent: "asia" },
  { id: "austria", name: "Austria", nameJa: "オーストリア", code: "at", continent: "europe" },
  { id: "belgium", name: "Belgium", nameJa: "ベルギー", code: "be", continent: "europe" },
  { id: "bulgaria", name: "Bulgaria", nameJa: "ブルガリア", code: "bg", continent: "europe" },
  { id: "croatia", name: "Croatia", nameJa: "クロアチア", code: "hr", continent: "europe" },
  { id: "czech", name: "Czech Republic", nameJa: "チェコ", code: "cz", continent: "europe" },
  { id: "denmark", name: "Denmark", nameJa: "デンマーク", code: "dk", continent: "europe" },
  { id: "finland", name: "Finland", nameJa: "フィンランド", code: "fi", continent: "europe" },
  { id: "greece", name: "Greece", nameJa: "ギリシャ", code: "gr", continent: "europe" },
  { id: "hungary", name: "Hungary", nameJa: "ハンガリー", code: "hu", continent: "europe" },
  { id: "iceland", name: "Iceland", nameJa: "アイスランド", code: "is", continent: "europe" },
  { id: "ireland", name: "Ireland", nameJa: "アイルランド", code: "ie", continent: "europe" },
  { id: "netherlands", name: "Netherlands", nameJa: "オランダ", code: "nl", continent: "europe" },
  { id: "norway", name: "Norway", nameJa: "ノルウェー", code: "no", continent: "europe" },
  { id: "poland", name: "Poland", nameJa: "ポーランド", code: "pl", continent: "europe" },
  { id: "portugal", name: "Portugal", nameJa: "ポルトガル", code: "pt", continent: "europe" },
  { id: "romania", name: "Romania", nameJa: "ルーマニア", code: "ro", continent: "europe" },
  { id: "russia", name: "Russia", nameJa: "ロシア", code: "ru", continent: "europe" },
  { id: "sweden", name: "Sweden", nameJa: "スウェーデン", code: "se", continent: "europe" },
  { id: "switzerland", name: "Switzerland", nameJa: "スイス", code: "ch", continent: "europe" },
  { id: "ukraine", name: "Ukraine", nameJa: "ウクライナ", code: "ua", continent: "europe" },
  { id: "costarica", name: "Costa Rica", nameJa: "コスタリカ", code: "cr", continent: "northamerica" },
  { id: "cuba", name: "Cuba", nameJa: "キューバ", code: "cu", continent: "northamerica" },
  { id: "guatemala", name: "Guatemala", nameJa: "グアテマラ", code: "gt", continent: "northamerica" },
  { id: "jamaica", name: "Jamaica", nameJa: "ジャマイカ", code: "jm", continent: "northamerica" },
  { id: "panama", name: "Panama", nameJa: "パナマ", code: "pa", continent: "northamerica" },
  { id: "fiji", name: "Fiji", nameJa: "フィジー", code: "fj", continent: "oceania" },
  { id: "newzealand", name: "New Zealand", nameJa: "ニュージーランド", code: "nz", continent: "oceania" },
  { id: "argentina", name: "Argentina", nameJa: "アルゼンチン", code: "ar", continent: "southamerica" },
  { id: "bolivia", name: "Bolivia", nameJa: "ボリビア", code: "bo", continent: "southamerica" },
  { id: "chile", name: "Chile", nameJa: "チリ", code: "cl", continent: "southamerica" },
  { id: "colombia", name: "Colombia", nameJa: "コロンビア", code: "co", continent: "southamerica" },
  { id: "ecuador", name: "Ecuador", nameJa: "エクアドル", code: "ec", continent: "southamerica" },
  { id: "peru", name: "Peru", nameJa: "ペルー", code: "pe", continent: "southamerica" },
  { id: "uruguay", name: "Uruguay", nameJa: "ウルグアイ", code: "uy", continent: "southamerica" },
  { id: "venezuela", name: "Venezuela", nameJa: "ベネズエラ", code: "ve", continent: "southamerica" },
];
const COUNTRY_BY_ID = Object.fromEntries(COUNTRY_LIST.map((c) => [c.id, c]));

// ---------- potions -------------------------------------------------------
// ids match the first version of the game so saved collections still work.
function potion(id, key, nameEn, nameJa, descriptionJa, color, extra) {
  return Object.assign({
    id, key, nameEn, nameJa, descriptionJa, color,
    image: `assets/potions/${key}-potion.webp`
  }, extra || {});
}
const POTIONS = [
  potion(1,  "health",      "Health Potion",       "回復のポーション",     "傷を治して元気になる魔法の薬です。",           "#ff4d6d", { tag: "heal",    min: 4 }),
  potion(2,  "strong",      "Strong Potion",       "力のポーション",       "体が強くなって重い物を持てるようになります。", "#c23a3a", { tag: "strong",  min: 3 }),
  potion(3,  "speed",       "Speed Potion",        "速さのポーション",     "とても速く走れるようになる魔法の薬です。",     "#35d0e0", { tag: "speed",   min: 3 }),
  potion(4,  "dark",        "Dark Potion",         "闇のポーション",       "暗闇の力を使えるようになります。",             "#7a45c9", { tag: "dark",    min: 3 }),
  potion(5,  "wind",        "Wind Potion",         "風のポーション",       "風を操って空を飛べるようになります。",         "#bfe9ff", { tag: "wind",    min: 3 }),
  potion(6,  "fire",        "Fire Potion",         "炎のポーション",       "火の力を使えるようになります。",               "#ff6a1f", { tag: "fire",    min: 3 }),
  potion(7,  "water",       "Water Potion",        "水のポーション",       "水の中でも息ができるようになります。",         "#2f8fff", { tag: "water",   min: 3 }),
  potion(8,  "light",       "Light Potion",        "光のポーション",       "暗い場所を明るく照らせます。",                 "#ffd54a", { tag: "light",   min: 3 }),
  potion(9,  "lucky",       "Lucky Potion",        "幸運のポーション",     "良いことがたくさん起こる魔法の薬です。",       "#2fcf6a", { tag: "luck",    min: 3 }),
  potion(10, "psychic",     "Psychic Potion",      "超能力のポーション",   "心の力で物を動かせるようになります。",         "#b04ad8", { tag: "psychic", min: 3 }),
  potion(11, "life",        "Life Potion",         "生命のポーション",     "体が元気になって病気が治ります。",             "#ffc83a", { tag: "life",    min: 3 }),
  potion(12, "magic",       "Magic Potion",        "魔法のポーション",     "魔法の力が強くなります。",                     "#5a6cff", { tag: "magic",   min: 4 }),
  potion(13, "shield",      "Shield Potion",       "守りのポーション",     "体を守るバリアができます。",                   "#b6bfd0", { tag: "shield",  min: 3 }),
  potion(14, "sleep",       "Sleep Potion",        "眠りのポーション",     "ぐっすり眠れるようになります。",               "#3b4bd0", { tag: "sleep",   min: 3 }),
  potion(15, "thunder",     "Thunder Potion",      "雷のポーション",       "雷の力を使えるようになります。",               "#4aa0ff", { tag: "thunder", min: 3 }),
  potion(16, "ice",         "Ice Potion",          "氷のポーション",       "氷の力を使えるようになります。",               "#58d6ff", { tag: "ice",     min: 3 }),
  potion(17, "earth",       "Earth Potion",        "大地のポーション",     "大地の力を使えるようになります。",             "#d9572a", { tag: "earth",   min: 3 }),
  potion(18, "basic",       "Basic Potion",        "基本のポーション",     "魔法使いの基本的な薬です。",                   "#4ccf4a", { tag: null,      min: 0 }),
  potion(19, "weak-health", "Weak Health Potion",  "弱い回復のポーション", "少しだけ傷を治してくれます。",                 "#ff6a7a", { tag: "heal",    min: 3 }),
  potion(20, "weak-magic",  "Weak Magic Potion",   "弱い魔法のポーション", "少しだけ魔法の力が強くなります。",             "#5ec8ff", { tag: "magic",   min: 3 }),
  potion(21, "secret",      "Potion of Knowledge", "知識のポーション",     "英語の知識が身につく特別なポーションです。",   "#ff7ad9", { tag: null, min: 0, isSecret: true })
];
const POTION_BY_ID = Object.fromEntries(POTIONS.map((p) => [p.id, p]));
const REGULAR_POTIONS = POTIONS.filter((p) => !p.isSecret);
const BASIC_POTION = POTION_BY_ID[18];
const SECRET_POTION = POTION_BY_ID[21];

// The tags where a bigger score unlocks a stronger potion of the same family.
const POTION_LADDERS = {
  heal:  [19, 1],   // 3 points = weak, 4+ = full strength
  magic: [20, 12]
};

// ---------- the secret recipe: spell a real word ---------------------------
// Pick three ingredients, in order, whose first letters spell one of these.
const SECRET_WORDS = `
ACE AIM ALL ANT APE ARM ART BAD BAG BAT BED BEE BIG BIT BOW BOX BOY BUG BUS BUT CAB CAN CAP CAR CAT COW CRY CUB CUP CUT DAD DAY DEN DIG DOG DOT DRY DUG EAR EAT EGG END EYE FAN FAR FAT FED FEW FIG FIN FIT FIX FLY FOG FOX FUN GAP GAS GEM GET GOT GUM GUT GYM HAM HAT HEN HID HIT HOP HOT HUG HUT ICE INK JAM JAR JAW JET JOB JOG JOY KEY KID KIT LAB LAD LAP LAY LEG LET LID LIP LOG LOT MAD MAP MAT MEN MIX MOM MUD MUG NAP NET NEW NOD NOT NUT OAK OAR ODD OIL OLD ONE OWL PAD PAN PAT PAW PEA PEN PET PIE PIG PIN PIT POD POT PUP RAG RAM RAN RAT RAY RED RIB RID RIP ROB ROD ROW RUB RUG RUN SAD SAG SAT SAW SAY SEA SEE SET SEW SHE SIP SIT SIX SKY SLY SOB SON SPY SUN TAB TAG TAN TAP TEA TEN THE TIE TIN TIP TOE TOP TOY TRY TUB TUG URN USE VAN VET WAG WAR WAX WAY WEB WED WET WIG WIN WIT YAK YAM YES YET ZAP ZIP ZOO
`.trim().split(/\s+/).filter((w) => w.length === 3 && w.split("").every((c) => LETTERS.indexOf(c) !== -1));
const SECRET_WORD_SET = new Set(SECRET_WORDS);

// ---------- brewing rules ----------------------------------------------------
const POWER_PRIMARY = 2;
const POWER_SECONDARY = 1;

// picks = [{ ingredient, country }, ...] in the order they were added.
function scorePowers(picks) {
  const score = {};
  const first = {};
  picks.forEach((pick, index) => {
    const ing = pick.ingredient;
    [[ing.primary, POWER_PRIMARY], [ing.secondary, POWER_SECONDARY]].forEach(([tag, pts]) => {
      if (!tag) return;
      score[tag] = (score[tag] || 0) + pts;
      if (first[tag] === undefined) first[tag] = index;
    });
  });
  return { score, first };
}

function strongestPower(picks) {
  const { score, first } = scorePowers(picks);
  let best = null;
  TAG_ORDER.forEach((tag) => {
    const s = score[tag] || 0;
    if (!s) return;
    if (!best || s > best.points ||
        (s === best.points && first[tag] < first[best.tag])) {
      best = { tag, points: s };
    }
  });
  return { best, score };
}

function lettersOf(picks) {
  return picks.map((p) => p.ingredient.letter).join("");
}

function spelledWord(picks) {
  const word = lettersOf(picks);
  return picks.length === 3 && SECRET_WORD_SET.has(word) ? word : null;
}

function continentsOf(picks) {
  return Array.from(new Set(picks.map((p) => p.country && p.country.continent).filter(Boolean)));
}

// Returns everything the UI needs to show a finished brew.
function brewPotion(picks, unlockedIds) {
  const unlocked = unlockedIds || [];
  const { best, score } = strongestPower(picks);
  // The secret Potion of Knowledge: once every other potion is in the book, the next brew makes it.
  const allRegular = REGULAR_POTIONS.every((p) => unlocked.indexOf(p.id) !== -1);
  const secretFound = unlocked.indexOf(SECRET_POTION.id) !== -1;

  let potionResult = BASIC_POTION;
  let points = best ? best.points : 0;
  if (allRegular && !secretFound) {
    potionResult = SECRET_POTION;
  } else if (best && best.points >= 3) {
    const ladder = POTION_LADDERS[best.tag];
    if (ladder) {
      potionResult = POTION_BY_ID[best.points >= 4 ? ladder[1] : ladder[0]];
    } else {
      potionResult = POTIONS.find((p) => p.tag === best.tag && !POTION_LADDERS[best.tag]) || BASIC_POTION;
    }
  }

  const stars = potionResult.isSecret ? 3 : points >= 5 ? 3 : points >= 4 ? 2 : 1;
  const continents = continentsOf(picks);
  return {
    potion: potionResult,
    tag: best ? best.tag : null,
    points,
    score,
    stars,
    secretUnlocked: potionResult.isSecret,
    continents,
    worldTraveler: continents.length >= 3 && picks.length >= 3
  };
}

// Blend the ingredient colours into one liquid colour (returns "#rrggbb").
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const hue = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

const EMPTY_POT_COLOR = "#35b58c";

function mixLiquidColor(picks) {
  if (!picks.length) return EMPTY_POT_COLOR;
  let r = 0, g = 0, b = 0;
  picks.forEach((p) => {
    const [pr, pg, pb] = hexToRgb(p.ingredient.color);
    // average in a squared space so bright colours don't turn muddy
    r += pr * pr; g += pg * pg; b += pb * pb;
  });
  const n = picks.length;
  let [h, s, l] = rgbToHsl(Math.sqrt(r / n), Math.sqrt(g / n), Math.sqrt(b / n));
  // keep the brew looking juicy: never grey, never black, never blown out
  s = Math.max(0.55, Math.min(0.95, s * 1.15 + 0.1));
  l = Math.max(0.38, Math.min(0.6, l));
  const [rr, gg, bb] = hslToRgb(h, s, l);
  return rgbToHex(rr, gg, bb);
}

// "a" / "an" for the speaking frame ("an ANT soup", "a BATS soup", "an FBI soup")
function articleFor(text) {
  const t = (text || "").toUpperCase();
  if (!t) return "a";
  if (SECRET_WORD_SET.has(t)) return "AEIOU".indexOf(t[0]) !== -1 ? "an" : "a";
  return "AEFHILMNORSX".indexOf(t[0]) !== -1 ? "an" : "a";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TAGS, TAG_ORDER, INGREDIENTS, INGREDIENT_BY_ID, LETTERS, CONTINENTS, COUNTRY_LIST, COUNTRY_BY_ID,
    POTIONS, POTION_BY_ID, REGULAR_POTIONS, SECRET_WORDS, SECRET_WORD_SET,
    scorePowers, strongestPower, brewPotion, mixLiquidColor, spelledWord, lettersOf, articleFor
  };
}
