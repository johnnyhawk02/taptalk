// Default vocabulary. Colours follow the Fitzgerald key so word types are
// always in the same colour:
//   pron = people/pronouns (yellow)   verb = actions (green)
//   desc = describing (blue)          noun = things (orange)
//   social = social words (pink)      neg = no/stop (red)
//   q = questions (purple)            folder = opens a page (grey)
//
// Symbol refs: "a:<id>" = ARASAAC pictogram bundled in symbols/arasaac,
// "m:<name>" = Mulberry symbol, "c:<name>" = custom symbol in symbols/custom,
// "u:<id>" = a photo or picture added by a caregiver.
//
// Each item is [label, symbol, type, extra] where extra may hold
// { say: 'spoken text', link: 'pageId' }. A page's icon is its picture in the
// left-hand column. A page with stay: true doesn't
// jump back to Home after a word is chosen (used for the place pages).

const F = (label, sym, link) => [label, sym, 'folder', { link }];
const S = { strip: true }; // shown in the core words strip on every page

// Pages in the left-hand column (always visible), top to bottom.
export const DEFAULT_NAV = ['food', 'drinks', 'play', 'feelings', 'needs', 'choice', 'people', 'places', 'describe', 'body', 'animals', 'colours'];

// Starting page sets: the grown-ups choose one on each device (Page manager).
// Each is a column of pages and the page the house button opens.
export const DEFAULT_SETS = [
  { id: 's-everyday', name: 'Everyday', home: 'home', nav: [...DEFAULT_NAV] },
  { id: 's-school', name: 'School', home: 'home', nav: ['school', 'schoolclass', 'lessons', 'schoolday', 'food', 'drinks', 'play', 'feelings', 'needs', 'choice', 'people', 'time'] },
  { id: 's-out', name: 'Out and about', home: 'home', nav: ['park', 'shops', 'travel', 'doctor', 'places', 'food', 'drinks', 'feelings', 'needs', 'choice', 'people', 'animals'] },
  { id: 's-hometime', name: 'Home time', home: 'home', nav: ['athome', 'mealtime', 'drinks', 'play', 'watch', 'fun', 'bathtime', 'bedtime', 'feelings', 'needs', 'choice', 'people'] },
  // For hard moments: few pages, low demand, opens on I need.
  { id: 's-calm', name: 'Calm', home: 'needs', nav: ['needs', 'feelings', 'choice', 'hurts', 'people'] },
];

export const DEFAULT_PAGES = {
  home: {
    name: 'Home',
    items: [
      ['I', 'a:2617', 'pron', S], ['want', 'a:5441', 'verb', S], ['more', 'a:5508', 'desc', S], ['help', 'a:4570', 'verb', S], ['stop', 'a:8289', 'neg', S],
      ['you', 'a:2608', 'pron'], ['go', 'a:2432', 'verb'], ['like', 'a:2418', 'verb'], ['don\'t like', 'a:22005', 'neg', { say: 'don\'t like' }], ['all done', 'a:28429', 'social', S],
      ['eat', 'a:2349', 'verb'], ['drink', 'a:2276', 'verb'], ['play', 'a:2439', 'verb'], ['toilet', 'a:2430', 'noun'], ['hurt', 'a:5484', 'desc'],
      ['yes', 'a:5584', 'social', S], ['no', 'a:5526', 'neg', S], ['wait', 'a:8109', 'verb'], F('Chat', 'a:3345', 'chat'), F('Actions', 'a:7297', 'actions'),
    ],
  },

  food: {
    name: 'Food',
    icon: 'a:4610',
    items: [
      ['apple', 'a:2462', 'noun'], ['banana', 'a:2530', 'noun'], ['grapes', 'a:3247', 'noun'], ['strawberry', 'a:2400', 'noun'], ['orange', 'a:2483', 'noun'],
      ['crisps', 'a:5400', 'noun'], ['biscuit', 'a:8312', 'noun'], ['yogurt', 'a:2618', 'noun'], ['cheese', 'a:2541', 'noun'], ['cake', 'a:2502', 'noun'],
      ['sandwich', 'a:2281', 'noun'], ['toast', 'a:2787', 'noun'], ['cereal', 'a:2328', 'noun'], ['pizza', 'a:2527', 'noun'], ['pasta', 'a:8652', 'noun'],
      ['chips', 'a:2505', 'noun'], ['chicken', 'a:36354', 'noun'], ['ice cream', 'a:3348', 'noun'], ['chocolate', 'a:2334', 'noun'], F('Mealtime', 'a:2532', 'mealtime'),
    ],
  },

  // Table talk: meals, how much, and what to eat with.
  mealtime: {
    name: 'Mealtime',
    stay: true,
    icon: 'a:2532',
    items: [
      ['breakfast', 'a:4625', 'noun'], ['lunch', 'a:4609', 'noun'], ['dinner', 'a:4592', 'noun'], ['snack', 'a:28206', 'noun'], ['hungry', 'a:4962', 'desc'],
      ['thirsty', 'a:4963', 'desc'], ['more', 'a:5508', 'desc'], ['all gone', 'a:28429', 'desc'], ['yummy', 'a:32340', 'desc'], ['yuck', 'a:32338', 'social'],
      ['egg', 'a:2427', 'noun'], ['bread', 'a:2494', 'noun'], ['sweets', 'a:2686', 'noun'], ['too hot', 'a:2300', 'desc', { say: 'I\'m too hot' }], ['full', 'a:4688', 'desc'],
      ['plate', 'a:2532', 'noun'], ['bowl', 'a:3257', 'noun'], ['spoon', 'a:2362', 'noun'], ['fork', 'a:2588', 'noun'], ['my cup', 'a:35607', 'noun'],
    ],
  },

  drinks: {
    name: 'Drinks',
    icon: 'a:4575',
    items: [
      ['water', 'a:2248', 'noun'], ['milk', 'a:2445', 'noun'], ['juice', 'a:11461', 'noun'], ['apple juice', 'a:11403', 'noun'], ['squash', 'a:3248', 'noun'],
      ['milkshake', 'a:8503', 'noun'], ['hot chocolate', 'a:6448', 'noun'], ['my cup', 'a:35607', 'noun'], ['thirsty', 'a:4963', 'desc'],
    ],
  },

  play: {
    name: 'Play',
    icon: 'a:9813',
    items: [
      ['toys', 'a:9813', 'noun'], ['ball', 'a:2269', 'noun'], ['bubbles', 'a:6945', 'noun'], ['lego', 'a:8508', 'noun'], ['blocks', 'a:4921', 'noun'],
      ['puzzle', 'a:2540', 'noun'], ['teddy', 'a:4945', 'noun'], ['doll', 'a:2482', 'noun'], ['dinosaur', 'a:2738', 'noun'], ['car', 'a:2339', 'noun'],
      ['playdough', 'm:playdough', 'noun'], ['draw', 'a:8088', 'verb'], ['paint', 'a:2348', 'noun'], ['stickers', 'a:4932', 'noun'], ['balloon', 'a:2407', 'noun'],
      ['sand', 'a:4565', 'noun'], ['water play', 'a:15507', 'noun'], ['games', 'a:37464', 'noun'], F('Watch', 'a:25498', 'watch'), F('Fun', 'a:2439', 'fun'),
    ],
  },

  // Programmes and music, with the words to control them.
  watch: {
    name: 'TV & music',
    stay: true,
    icon: 'a:25498',
    items: [
      ['Mr Tumble', 'a:31426', 'noun'], ['Singing Hands', 'a:11754', 'noun'], ['CBeebies', 'a:9802', 'noun'], ['Peppa Pig', 'a:2327', 'noun'], ['Bluey', 'a:2517', 'noun'],
      ['TV', 'a:25498', 'noun'], ['YouTube', 'a:29153', 'noun'], ['film', 'a:4602', 'noun'], ['iPad', 'a:29151', 'noun'], ['music', 'a:24795', 'noun'],
      ['songs', 'a:2315', 'noun'], ['dance', 'a:2652', 'verb'], ['headphones', 'a:5915', 'noun'], ['loud', 'a:2647', 'desc'], ['quiet', 'a:5936', 'desc'],
      ['again', 'a:37163', 'social'], ['stop', 'a:8289', 'neg'], ['next', 'a:27331', 'desc'], ['my turn', 'a:7158', 'social'], ['all done', 'a:28429', 'social'],
    ],
  },

  fun: {
    name: 'Fun',
    stay: true,
    icon: 'a:2439',
    items: [
      ['swimming', 'a:25038', 'noun'], ['soft play', 'a:8191', 'noun'], ['trampoline', 'a:23891', 'noun'], ['park', 'a:26296', 'noun'], ['swing', 'a:4608', 'noun'],
      ['slide', 'a:4759', 'noun'], ['bike ride', 'a:5517', 'verb'], ['walk', 'a:37345', 'verb'], ['chase', 'a:7037', 'verb'], ['hide and seek', 'a:4642', 'verb'],
      ['tickles', 'a:5480', 'verb'], ['play with friends', 'a:2439', 'verb'], ['sensory room', 'a:8217', 'noun'], ['baking', 'a:5487', 'verb'], ['colouring', 'a:2348', 'verb'],
      ['book', 'a:2450', 'noun'], ['lights', 'a:8155', 'noun'], ['kite', 'a:2350', 'noun'], ['bubbles', 'a:6945', 'noun'], ['music', 'a:24795', 'noun'],
    ],
  },

  feelings: {
    name: 'Feelings',
    icon: 'a:11476',
    items: [
      ['happy', 'a:3245', 'desc'], ['sad', 'a:2606', 'desc'], ['angry', 'a:2374', 'desc'], ['scared', 'a:2261', 'desc'], ['tired', 'a:2314', 'desc'],
      ['excited', 'a:39090', 'desc'], ['worried', 'a:26985', 'desc'], ['confused', 'a:2352', 'desc'], ['silly', 'a:35555', 'desc'], ['calm', 'a:31310', 'desc'],
      ['sick', 'a:3308', 'desc'], ['hurt', 'a:5484', 'desc'], ['too loud', 'a:37857', 'desc'], ['quiet please', 'a:5936', 'desc'], ['I need a break', 'a:3299', 'social'],
      ['cuddle', 'a:6023', 'verb'], ['hot', 'a:2300', 'desc'], ['cold', 'a:35557', 'desc'], ['hungry', 'a:4962', 'desc'], ['thirsty', 'a:4963', 'desc'],
    ],
  },

  people: {
    name: 'People',
    icon: 'a:7116',
    items: [
      ['me', 'a:2617', 'pron'], ['you', 'a:2608', 'pron'], ['mum', 'a:2458', 'pron'], ['dad', 'a:31146', 'pron'], ['family', 'a:2392', 'pron'],
      ['brother', 'a:2423', 'pron'], ['sister', 'a:2422', 'pron'], ['nan', 'a:2243', 'pron'], ['grandad', 'a:23717', 'pron'], ['baby', 'a:2275', 'pron'],
      ['teacher', 'a:2457', 'pron'], ['TA', 'a:2476', 'pron'], ['staff', 'a:2456', 'pron'], ['friend', 'a:8487', 'pron'], ['doctor', 'a:2467', 'pron'],
      ['we', 'a:7184', 'pron'], ['they', 'a:7032', 'pron'], ['him', 'a:6480', 'pron'], ['her', 'a:7028', 'pron'], ['everyone', 'a:36081', 'pron'],
    ],
  },

  places: {
    name: 'Places',
    icon: 'a:31330',
    items: [
      F('School', 'a:3082', 'school'), F('Home', 'a:2317', 'athome'), F('Park', 'a:32987', 'park'), F('Shops', 'a:6618', 'shops'), F('Doctor', 'a:8263', 'doctor'),
      F('Car & bus', 'a:6981', 'travel'), F('Bedtime', 'a:28623', 'bedtime'), F('Bath time', 'a:31853', 'bathtime'), ['outside', 'a:5475', 'noun'], ['playground', 'a:2859', 'noun'],
      ['swimming', 'a:25038', 'noun'], ['beach', 'a:2826', 'noun'], ['toilet', 'a:2430', 'noun'], ['sensory room', 'a:8217', 'noun'],
    ],
  },

  // School opens three smaller pages so each fits on one screen.
  school: {
    name: 'School',
    stay: true,
    icon: 'a:3082',
    items: [
      F('In class', 'a:2440', 'schoolclass'), F('Lessons', 'a:24795', 'lessons'), F('My day', 'a:9902', 'schoolday'), ['school', 'a:3082', 'noun'], ['teacher', 'a:2457', 'pron'],
      ['friend', 'a:8487', 'pron'], ['my class', 'a:15734', 'noun'], ['classroom', 'a:39686', 'noun'], ['playground', 'a:2859', 'noun'], ['hall', 'a:38427', 'noun'],
      ['toilet', 'a:2430', 'noun'], ['my bag', 'a:2475', 'noun'], ['coat', 'a:27978', 'noun'],
    ],
  },

  schoolclass: {
    name: 'In class',
    stay: true,
    icon: 'a:2440',
    items: [
      ['book', 'a:2450', 'noun'], ['pencil', 'a:2440', 'noun'], ['paper', 'a:2398', 'noun'], ['scissors', 'a:6664', 'noun'], ['glue', 'a:2510', 'noun'],
      ['paint', 'a:2348', 'noun'], ['computer', 'a:7190', 'noun'], ['iPad time', 'a:28099', 'noun'], ['sit down', 'a:25082', 'verb'], ['line up', 'a:7102', 'verb'],
    ],
  },

  lessons: {
    name: 'Lessons',
    stay: true,
    icon: 'a:24795',
    items: [
      ['music', 'a:24795', 'noun'], ['PE', 'a:10258', 'noun'], ['story', 'a:8346', 'noun'], ['art', 'a:2348', 'noun'], ['cooking', 'a:3235', 'noun'],
      ['swimming', 'a:25038', 'noun'], ['hydro pool', 'a:3142', 'noun'], ['soft play', 'a:8191', 'noun'], ['sensory room', 'a:8217', 'noun'], ['speech therapy', 'a:2454', 'noun'],
      ['OT', 'a:16084', 'noun'], ['physio', 'a:2395', 'noun'],
    ],
  },

  schoolday: {
    name: 'My day',
    stay: true,
    icon: 'a:9902',
    items: [
      ['taxi', 'a:2580', 'noun'], ['minibus', 'a:35600', 'noun'], ['register', 'a:9902', 'noun'], ['assembly', 'a:39263', 'noun'], ['snack time', 'a:24854', 'noun'],
      ['play time', 'a:27339', 'noun'], ['lunch', 'a:4609', 'noun'], ['lunch box', 'a:39457', 'noun'], ['choosing time', 'a:30510', 'noun'], ['home time', 'a:16805', 'noun'],
    ],
  },

  park: {
    name: 'Park',
    stay: true,
    icon: 'a:32987',
    items: [
      ['park', 'a:26296', 'noun'], ['swing', 'a:4608', 'noun'], ['slide', 'a:4759', 'noun'], ['roundabout', 'a:38554', 'noun'], ['see-saw', 'a:4572', 'noun'],
      ['climbing frame', 'a:8226', 'noun'], ['sandpit', 'a:4565', 'noun'], ['ball', 'a:2269', 'noun'], ['bike', 'a:2277', 'noun'], ['scooter', 'a:2508', 'noun'],
      ['ducks', 'a:2563', 'noun'], ['tree', 'a:3057', 'noun'], ['run', 'a:2719', 'verb'], ['push me', 'a:5430', 'verb'], ['higher', 'a:5388', 'desc'],
      ['again', 'a:37163', 'desc'], ['my turn', 'a:7158', 'social'], ['ice cream', 'a:3348', 'noun'], ['home time', 'a:16805', 'noun'],
    ],
  },

  shops: {
    name: 'Shops',
    stay: true,
    icon: 'a:6618',
    items: [
      ['shop', 'a:8986', 'noun'], ['trolley', 'a:5948', 'noun'], ['basket', 'a:26748', 'noun'], ['money', 'a:4630', 'noun'], ['buy', 'a:8985', 'verb'],
      ['pay', 'a:39710', 'verb'], ['sweets', 'a:2686', 'noun'], ['snack', 'a:28206', 'noun'], ['juice', 'a:11461', 'noun'], ['toy', 'a:32568', 'noun'],
      ['clothes', 'a:7233', 'noun'], ['shoes', 'a:24801', 'noun'], ['wait', 'a:8109', 'verb'], ['car', 'a:2339', 'noun'], ['help', 'a:4570', 'verb'],
      ['go home', 'a:16805', 'verb'],
    ],
  },

  travel: {
    name: 'Car & bus',
    stay: true,
    icon: 'a:6981',
    items: [
      ['car', 'a:2339', 'noun'], ['bus', 'a:2262', 'noun'], ['train', 'a:2603', 'noun'], ['seatbelt', 'a:5962', 'noun'], ['window', 'a:2611', 'noun'],
      ['music', 'a:24795', 'noun'], ['where are we going?', 'a:7764', 'q'], ['are we there yet?', 'a:16805', 'q'], ['stop', 'a:8289', 'neg'], ['go', 'a:2432', 'verb'],
      ['home', 'a:6964', 'noun'], ['school', 'a:3082', 'noun'], ['park', 'a:26296', 'noun'], ['shop', 'a:8986', 'noun'], ['too hot', 'a:2300', 'desc'],
      ['feel sick', 'a:31795', 'desc'],
    ],
  },

  bedtime: {
    name: 'Bedtime',
    stay: true,
    icon: 'a:28623',
    items: [
      ['bed', 'a:2304', 'noun'], ['pyjamas', 'a:2522', 'noun'], ['brush teeth', 'a:2326', 'verb'], ['toilet', 'a:2430', 'noun'], ['story', 'a:8346', 'noun'],
      ['teddy', 'a:4945', 'noun'], ['cuddle', 'a:6023', 'verb'], ['light on', 'a:8103', 'verb'], ['light off', 'a:8027', 'verb'], ['water', 'a:2248', 'noun'],
      ['tired', 'a:2314', 'desc'], ['night night', 'a:26997', 'social'], ['scared', 'a:2261', 'desc'], ['dark', 'a:26993', 'desc'],
    ],
  },

  bathtime: {
    name: 'Bath time',
    stay: true,
    icon: 'a:31853',
    items: [
      ['bath', 'a:2272', 'noun'], ['shower', 'a:2371', 'noun'], ['bubbles', 'a:6945', 'noun'], ['soap', 'a:2964', 'noun'], ['shampoo', 'a:2699', 'noun'],
      ['towel', 'a:2593', 'noun'], ['bath toys', 'a:28577', 'noun'], ['wash hair', 'a:35037', 'verb'], ['hot', 'a:2300', 'desc'], ['cold', 'a:35557', 'desc'],
      ['wet', 'a:4697', 'desc'], ['dry', 'a:2566', 'desc'], ['all done', 'a:28429', 'social'],
    ],
  },

  animals: {
    name: 'Animals',
    icon: 'a:6901',
    items: [
      ['dog', 'a:2517', 'noun'], ['cat', 'a:2406', 'noun'], ['horse', 'a:2294', 'noun'], ['cow', 'a:2609', 'noun'], ['pig', 'a:2327', 'noun'],
      ['sheep', 'a:2489', 'noun'], ['duck', 'a:2563', 'noun'], ['bird', 'a:2490', 'noun'], ['fish', 'a:2520', 'noun'], ['rabbit', 'a:2351', 'noun'],
      ['frog', 'a:2543', 'noun'], ['lion', 'a:2449', 'noun'], ['elephant', 'a:2372', 'noun'], ['tiger', 'a:2590', 'noun'], ['giraffe', 'a:2437', 'noun'],
      ['dinosaur', 'a:2738', 'noun'],
    ],
  },

  colours: {
    name: 'Colours',
    icon: 'a:5968',
    items: [
      ['red', 'a:2808', 'desc'], ['blue', 'a:3355', 'desc'], ['green', 'a:4886', 'desc'], ['yellow', 'a:2648', 'desc'], ['pink', 'a:2807', 'desc'],
      ['purple', 'a:2907', 'desc'], ['orange', 'a:8730', 'desc'], ['black', 'a:2886', 'desc'], ['white', 'a:2662', 'desc'], ['brown', 'a:2923', 'desc'],
    ],
  },

  // PDA-friendly: ways to say no, not yet, or my way, respectfully. These
  // are real communication and should always be listened to.
  choice: {
    name: 'My choice',
    stay: true,
    icon: 'a:30510',
    items: [
      ['my choice', 'a:30510', 'social'], ['not now', 'a:13080', 'neg', S], ['later', 'a:13080', 'desc'], ['maybe', 'a:38796', 'social'], ['no thank you', 'a:5525', 'neg'],
      ['I\'ll do it', 'a:32751', 'pron'], ['you do it', 'a:6625', 'pron'], ['together', 'a:5367', 'desc'], ['my way', 'a:12264', 'social'], ['my turn', 'a:7158', 'social'],
      ['your turn', 'a:2608', 'social'], ['stop asking', 'a:7195', 'neg'], ['I need space', 'a:39247', 'social'], ['leave me', 'a:25776', 'neg', { say: 'leave me alone' }], ['I don\'t want to', 'a:21587', 'neg'],
      ['something else', 'a:17056', 'desc'], ['I\'ve finished', 'a:28429', 'social'], ['wait', 'a:8109', 'verb'], ['help me', 'a:32648', 'verb'], ['I\'m the boss', 'a:2718', 'pron'],
    ],
  },

  // Humour and play keep the pressure low.
  funny: {
    name: 'Funny',
    stay: true,
    icon: 'a:30393',
    items: [
      ['that\'s funny', 'a:30393', 'social'], ['silly', 'a:35555', 'desc'], ['joke', 'a:21537', 'noun'], ['tickle', 'a:5480', 'verb'], ['uh oh', 'a:39248', 'social'],
      ['oops', 'a:39248', 'social'], ['wow', 'a:9038', 'social'], ['yuck', 'a:32338', 'social'], ['ha ha', 'a:35555', 'social'], ['again', 'a:37163', 'social'],
      ['cheeky', 'a:31416', 'desc'], ['boo', 'a:6916', 'social'], ['peekaboo', 'a:6493', 'social'], ['funny face', 'a:31915', 'noun'], ['messy', 'a:36633', 'desc'],
      ['surprise', 'a:8517', 'noun'],
    ],
  },

  // For new staff and visitors. Edit the words to fit Robyn.
  aboutme: {
    name: 'About me',
    stay: true,
    icon: 'a:6009',
    items: [
      ['Hello, I\'m Robyn', 'a:6009', 'social', { say: 'Hello, my name is Robyn.' }], ['I\'m 10', 'a:29254', 'pron', { say: 'I am ten years old.' }], ['I talk with my iPad', 'a:28099', 'pron', { say: 'I talk with my iPad. Please wait while I find my words.' }], ['I sign too', 'a:11754', 'pron', { say: 'I use signs too.' }], ['give me time', 'a:8109', 'social', { say: 'Please give me time to answer.' }],
      ['I understand', 'a:11697', 'pron', { say: 'I understand more than I can say.' }], ['show me', 'a:11308', 'verb', { say: 'Show me, please.' }], ['let me choose', 'a:30510', 'social', { say: 'Please let me choose.' }], ['talk to me', 'a:3345', 'social', { say: 'Please talk to me, not about me.' }], ['I need breaks', 'a:3299', 'pron', { say: 'Sometimes I need a break.' }],
      ['when I\'m upset', 'a:11959', 'pron', { say: 'When I\'m upset, please give me space and keep it calm and quiet.' }], ['ask me', 'a:9843', 'social', { say: 'Please ask me.' }],
    ],
  },

  athome: {
    name: 'At home',
    stay: true,
    icon: 'a:2317',
    items: [
      ['home', 'a:6964', 'noun'], ['mum', 'a:2458', 'pron'], ['dad', 'a:31146', 'pron'], ['bedroom', 'a:5988', 'noun'], ['kitchen', 'a:33070', 'noun'],
      ['living room', 'a:33074', 'noun'], ['garden', 'a:30608', 'noun'], ['sofa', 'a:2571', 'noun'], ['TV', 'a:25498', 'noun'], ['tablet', 'a:29151', 'noun'],
      ['toys', 'a:9813', 'noun'], ['snack', 'a:28206', 'noun'], ['dinner', 'a:4592', 'noun'], ['bath', 'a:2272', 'noun'], ['bed', 'a:2304', 'noun'],
      ['cuddle', 'a:6023', 'verb'], ['light', 'a:4936', 'noun'], ['music', 'a:24795', 'noun'], ['outside', 'a:5475', 'noun'], ['quiet', 'a:5936', 'desc'],
    ],
  },

  doctor: {
    name: 'Doctor',
    stay: true,
    icon: 'a:8263',
    items: [
      ['doctor', 'a:2467', 'pron'], ['nurse', 'a:31390', 'pron'], ['dentist', 'a:11229', 'pron'], ['hospital', 'a:6523', 'noun'], ['medicine', 'a:2962', 'noun'],
      ['plaster', 'a:8331', 'noun'], ['injection', 'a:5601', 'noun'], ['blood test', 'a:5901', 'noun'], ['open wide', 'a:2663', 'verb'], ['it hurts here', 'a:30620', 'desc', { say: 'it hurts here' }],
      ['ears', 'a:2871', 'noun'], ['mouth', 'a:2663', 'noun'], ['tummy', 'a:2786', 'noun'], ['glasses', 'a:3329', 'noun'], ['hearing aid', 'a:5912', 'noun'],
      ['scared', 'a:2261', 'desc'], ['brave', 'a:36163', 'desc'], ['sticker', 'a:4932', 'noun'], ['all done', 'a:28429', 'social'], ['feel better', 'a:12293', 'desc'],
    ],
  },

  actions: {
    name: 'Actions',
    icon: 'a:7297',
    items: [
      ['go', 'a:2432', 'verb'], ['come', 'a:11708', 'verb'], ['look', 'a:2474', 'verb'], ['give', 'a:17038', 'verb'], ['get', 'a:17044', 'verb'],
      ['make', 'a:6190', 'verb'], ['open', 'a:4549', 'verb'], ['close', 'a:2697', 'verb'], ['put', 'a:5447', 'verb'], ['do', 'a:32751', 'verb'],
      ['turn on', 'a:21818', 'verb'], ['turn off', 'a:8103', 'verb'], ['push', 'a:4638', 'verb'], ['pull', 'm:pull_,_to', 'verb'], ['find', 'a:6019', 'verb'],
      ['try', 'a:26144', 'verb'], ['finish', 'a:32814', 'verb'], ['show me', 'a:11308', 'verb'], F('Move', 'a:2719', 'move'), F('More actions', 'a:32751', 'moreactions'),
    ],
  },

  move: {
    name: 'Move',
    stay: true,
    items: [
      ['sit', 'a:6611', 'verb'], ['stand', 'a:13368', 'verb'], ['walk', 'a:3251', 'verb'], ['run', 'a:2719', 'verb'], ['jump', 'a:2804', 'verb'],
      ['dance', 'a:2652', 'verb'], ['swim', 'a:6568', 'verb'], ['climb', 'a:8226', 'verb'], ['throw', 'a:6543', 'verb'], ['catch', 'a:8187', 'verb'],
      ['kick', 'a:15463', 'verb'], ['tickle', 'a:5480', 'verb'], ['hug', 'a:4550', 'verb'],
    ],
  },

  moreactions: {
    name: 'More actions',
    stay: true,
    items: [
      ['sing', 'a:2315', 'verb'], ['read', 'a:5973', 'verb'], ['watch', 'a:2474', 'verb'], ['listen', 'a:2381', 'verb'], ['sleep', 'a:2369', 'verb'],
      ['wash hands', 'a:8617', 'verb'], ['get dressed', 'a:2781', 'verb'], ['brush teeth', 'a:2326', 'verb'], ['wait', 'a:8109', 'verb'], ['choose', 'a:30510', 'verb'],
      ['share', 'a:16623', 'verb'], ['tidy up', 'a:8680', 'verb'], ['fix', 'a:15327', 'verb'], ['cook', 'a:3235', 'verb'], ['clean', 'a:3351', 'verb'],
    ],
  },

  describe: {
    name: 'Describe',
    icon: 'a:4658',
    items: [
      ['big', 'a:4658', 'desc'], ['little', 'a:4571', 'desc'], ['more', 'a:5508', 'desc'], ['good', 'a:4581', 'desc'], ['bad', 'a:4690', 'desc'],
      ['same', 'a:4667', 'desc'], ['different', 'a:32386', 'desc'], ['hot', 'a:2300', 'desc'], ['cold', 'a:35557', 'desc'], ['wet', 'a:4697', 'desc'],
      ['dirty', 'a:4750', 'desc'], ['broken', 'a:4736', 'desc'], ['loud', 'a:2647', 'desc'], ['quiet', 'a:5936', 'desc'], ['fast', 'a:5306', 'desc'],
      ['nice', 'a:10212', 'desc'], ['yucky', 'a:32338', 'desc'], ['easy', 'a:32434', 'desc'], ['hard', 'a:32436', 'desc'], F('Little words', 'a:7095', 'littlewords'),
    ],
  },

  littlewords: {
    name: 'Little words',
    stay: true,
    items: [
      ['now', 'a:13026', 'desc'], ['again', 'a:37163', 'desc'], ['up', 'a:5388', 'desc'], ['down', 'a:5355', 'desc'], ['in', 'a:7034', 'desc'],
      ['out', 'a:2806', 'desc'], ['on', 'a:7814', 'desc'], ['off', 'a:7020', 'desc'], ['it', 'a:31670', 'desc'], ['that', 'a:6906', 'desc'],
      ['this', 'a:7095', 'desc'], ['here', 'a:5382', 'desc'], ['there', 'a:5375', 'desc'], ['mine', 'a:12264', 'desc'], ['yours', 'a:12281', 'desc'],
      ['all', 'a:5596', 'desc'], ['some', 'a:5374', 'desc'], ['not', 'a:32308', 'neg'], ['empty', 'a:4767', 'desc'], ['full', 'a:4688', 'desc'],
    ],
  },

  body: {
    name: 'Body',
    icon: 'a:2728',
    items: [
      ['head', 'a:2673', 'noun'], ['eyes', 'a:2876', 'noun'], ['ears', 'a:2871', 'noun'], ['nose', 'a:2887', 'noun'], ['mouth', 'a:2663', 'noun'],
      ['teeth', 'a:2737', 'noun'], ['throat', 'a:3332', 'noun'], ['chest', 'a:2853', 'noun'], ['tummy', 'a:2786', 'noun'], ['back', 'a:2748', 'noun'],
      ['arm', 'a:2669', 'noun'], ['hand', 'a:2928', 'noun'], ['finger', 'a:3298', 'noun'], ['leg', 'a:8666', 'noun'], ['knee', 'a:2810', 'noun'],
      ['foot', 'a:2841', 'noun'], ['hurt', 'a:5484', 'desc'], ['itchy', 'a:11356', 'desc'], ['sick', 'a:3308', 'desc'], F('It hurts', 'a:5484', 'hurts'),
    ],
  },

  // Where and how much it hurts.
  hurts: {
    name: 'It hurts',
    stay: true,
    icon: 'a:5484',
    items: [
      ['hurt', 'a:5484', 'desc'], ['headache', 'a:28651', 'noun', { say: 'my head hurts' }], ['tummy ache', 'a:10375', 'noun', { say: 'my tummy hurts' }], ['toothache', 'a:10263', 'noun', { say: 'my tooth hurts' }], ['cut', 'a:5484', 'noun'],
      ['itchy', 'a:11356', 'desc'], ['sick', 'a:3308', 'desc'], ['it hurts here', 'a:30620', 'desc', { say: 'it hurts here' }], ['a little', 'a:4716', 'desc'], ['a lot', 'a:7168', 'desc'],
      ['really hurts', 'a:2367', 'desc', { say: 'it really hurts' }], ['medicine', 'a:2962', 'noun'], ['plaster', 'a:8331', 'noun'], ['cuddle', 'a:6023', 'verb'], ['feel better', 'a:12293', 'desc'],
    ],
  },

  chat: {
    name: 'Chat',
    icon: 'a:3345',
    items: [
      ['hello', 'a:6009', 'social'], ['goodbye', 'a:5896', 'social'], ['please', 'a:8194', 'social'], ['thank you', 'a:8129', 'social'], ['sorry', 'a:11625', 'social'],
      ['how are you?', 'a:22619', 'q'], ['I\'m OK', 'a:5397', 'social'], ['look at me', 'a:2474', 'social'], ['help me', 'a:32648', 'social', { say: 'help me please' }], ['excuse me', 'a:24863', 'social'],
      ['I love you', 'a:11519', 'social'], ['well done', 'a:13018', 'social'], ['cool', 'a:11599', 'social'], ['my turn', 'a:7158', 'social'], ['your turn', 'a:2608', 'social'],
      ['again', 'a:37163', 'social'], F('Questions', 'a:22620', 'questions'), F('Funny', 'a:30393', 'funny'), F('Time', 'a:22633', 'time'), F('About me', 'a:6009', 'aboutme'),
    ],
  },

  questions: {
    name: 'Questions',
    stay: true,
    items: [
      ['what', 'a:22620', 'q'], ['where', 'a:7764', 'q'], ['who', 'a:9853', 'q'], ['when', 'a:22621', 'q'], ['why', 'a:24763', 'q'],
      ['what\'s that?', 'a:22620', 'q'], ['what\'s next?', 'a:22620', 'q'], ['where to?', 'a:7764', 'q', { say: 'where are we going?' }], ['are we there yet?', 'a:16805', 'q'], ['where\'s mum?', 'a:7764', 'q'],
      ['can I have?', 'a:5441', 'q'], ['can I go?', 'a:2432', 'q'], ['is it my turn?', 'a:7158', 'q'],
    ],
  },

  // Regulation: what helps when it all gets too much.
  needs: {
    name: 'I need',
    stay: true,
    icon: 'a:3299',
    items: [
      ['break', 'a:3299', 'noun', { say: 'I need a break', strip: true }], ['quiet', 'a:5936', 'desc', { say: 'I need quiet' }], ['headphones', 'a:5915', 'noun'], ['squeeze', 'a:11180', 'verb'], ['swing', 'a:4608', 'noun'],
      ['trampoline', 'a:23891', 'noun'], ['dark room', 'a:26993', 'noun'], ['sensory room', 'a:8217', 'noun'], ['cuddle', 'a:6023', 'verb'], ['my space', 'a:39247', 'noun', { say: 'I need my space' }],
      ['go outside', 'a:2806', 'verb', { say: 'I want to go outside' }], ['water', 'a:2248', 'noun'], ['snack', 'a:28206', 'noun'], ['toilet', 'a:2430', 'noun'], ['too loud', 'a:37857', 'desc', { say: 'it\'s too loud' }],
      ['too bright', 'a:6015', 'desc', { say: 'it\'s too bright' }], ['too busy', 'a:38445', 'desc', { say: 'it\'s too busy' }], ['too hot', 'a:2300', 'desc', { say: 'I\'m too hot' }], ['too cold', 'a:35557', 'desc', { say: 'I\'m too cold' }], ['calm down', 'a:31310', 'verb'],
    ],
  },

  // Time and routine words for first/then, today and the week.
  time: {
    name: 'Time',
    stay: true,
    icon: 'a:22633',
    items: [
      ['now', 'a:13026', 'desc'], ['later', 'a:13080', 'desc'], ['first', 'a:4726', 'desc'], ['then', 'a:13080', 'desc'], ['next', 'a:27331', 'desc'],
      ['after', 'a:7818', 'desc'], ['finished', 'a:28429', 'desc'], ['soon', 'a:22633', 'desc'], ['wait', 'a:8109', 'verb'], ['morning', 'a:25704', 'noun'],
      ['afternoon', 'a:7268', 'noun'], ['night', 'a:7181', 'noun'], ['today', 'a:7131', 'noun'], ['tomorrow', 'a:7152', 'noun'], ['yesterday', 'a:6926', 'noun'],
      ['school day', 'a:3082', 'noun'], ['home time', 'a:16805', 'noun'], ['bedtime', 'a:2304', 'noun'], ['weekend', 'a:27329', 'noun'], F('Days', 'a:37730', 'days'),
    ],
  },

  days: {
    name: 'Days',
    stay: true,
    items: [
      ['Monday', 'a:37730', 'noun'], ['Tuesday', 'a:37730', 'noun'], ['Wednesday', 'a:37730', 'noun'], ['Thursday', 'a:37730', 'noun'], ['Friday', 'a:37730', 'noun'],
      ['Saturday', 'a:37730', 'noun'], ['Sunday', 'a:37730', 'noun'], ['today', 'a:7131', 'noun'], ['tomorrow', 'a:7152', 'noun'], ['yesterday', 'a:6926', 'noun'],
    ],
  },
};
